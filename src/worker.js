// Transmog Exchange - Cloudflare Worker
//
// Serves the site from ./site (static assets) at /transmog/ and the API at
// /transmog/api/*, backed by the D1 database bound as DB.
//
//   POST /transmog/api/upload  {player_name, discord_name, token, items[]}
//   POST /transmog/api/clear   {token}
//   GET  /transmog/api/search?q=&loc=&limit=&offset=
//   GET  /transmog/api/stats
//   GET  /transmog/api/players

const BASE = '/transmog';
const MAX_BODY = 4 * 1024 * 1024;
const MAX_ITEMS = 10000;
const MAX_SEARCH_LIMIT = 10000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '') {
      return Response.redirect(`${url.origin}${BASE}/`, 302);
    }

    if (path.startsWith(`${BASE}/api/`)) {
      try {
        return await api(request, env, path.slice(`${BASE}/api/`.length), url);
      } catch (e) {
        console.error(e);
        return json({ error: 'server_error', message: 'Something went wrong on the server. Try again in a minute.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function api(request, env, route, url) {
  const method = request.method;

  if (route === 'upload' && method === 'POST') return upload(env, await readBody(request));
  if (route === 'clear' && method === 'POST') return clear(env, await readBody(request));
  if (route === 'search' && method === 'GET') return search(env, url.searchParams);
  if (route === 'stats' && method === 'GET') return stats(env);
  if (route === 'players' && method === 'GET') return players(env);

  return json({ error: 'not_found', message: 'Unknown API route.' }, 404);
}

// ── Writes ────────────────────────────────────────────────────────────────────

async function upload(env, body) {
  if (body instanceof Response) return body;

  const name = cleanText(body.player_name, 40);
  const discord = cleanText(body.discord_name, 40) || null;
  const token = String(body.token ?? '');
  const items = body.items;

  if (!name) return bad('missing_name', 'Set a display name first: ;transmog_inventory setname <name>.');
  if (!UUID_RE.test(token)) return bad('bad_token', 'Upload token is missing or invalid.');
  if (!Array.isArray(items)) return bad('bad_items', 'No items were sent.');
  if (items.length > MAX_ITEMS) return bad('too_many_items', `At most ${MAX_ITEMS} items per player.`);

  const rows = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const noun = cleanText(it.noun, 60);
    const full = cleanText(it.full_name, 200);
    if (!noun || !full) continue;
    rows.push({
      c: cleanText(it.character, 40),
      n: noun,
      f: full,
      l: cleanText(it.worn_location, 80),
      q: clampInt(it.quantity, 1, 1, 100000),
      o: cleanText(it.notes, 120),
      p: priceOrNull(it.price),
    });
  }

  const hash = await sha256(token.toLowerCase());
  const mine = await env.DB.prepare('SELECT character_name FROM uploaders WHERE token_hash = ?1')
    .bind(hash).first();
  const holder = await env.DB.prepare('SELECT token_hash FROM uploaders WHERE character_name = ?1')
    .bind(name).first();

  if (holder && holder.token_hash !== hash) {
    return bad('name_claimed',
      'That display name is already in use by another uploader. ' +
      'If it is yours, upload from the machine you used before (the token is in ' +
      'transmog/transmog_config.json), or pick another: ;transmog_inventory setname <name>.');
  }

  const stmts = [];
  if (mine && mine.character_name !== name) {
    // Same player, new display name (or new capitalisation): drop the old entry.
    stmts.push(env.DB.prepare('DELETE FROM transmog_items WHERE character_name = ?1').bind(mine.character_name));
    stmts.push(env.DB.prepare('DELETE FROM uploaders WHERE token_hash = ?1').bind(hash));
  }
  stmts.push(env.DB.prepare(
    `INSERT INTO uploaders (character_name, token_hash, discord_name)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(character_name) DO UPDATE SET
       last_upload  = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
       discord_name = COALESCE(excluded.discord_name, uploaders.discord_name)`
  ).bind(name, hash, discord));
  stmts.push(env.DB.prepare('DELETE FROM transmog_items WHERE character_name = ?1').bind(name));
  // One statement for all items: the free plan caps queries per request.
  stmts.push(env.DB.prepare(
    `INSERT INTO transmog_items
       (character_name, "character", noun, full_name, worn_location, quantity, notes, price)
     SELECT ?1,
            json_extract(value, '$.c'), json_extract(value, '$.n'), json_extract(value, '$.f'),
            json_extract(value, '$.l'), json_extract(value, '$.q'), json_extract(value, '$.o'),
            json_extract(value, '$.p')
       FROM json_each(?2)`
  ).bind(name, JSON.stringify(rows)));

  await env.DB.batch(stmts); // runs as one transaction

  return json({ success: true, player_name: name, items_uploaded: rows.length });
}

async function clear(env, body) {
  if (body instanceof Response) return body;
  const token = String(body.token ?? '');
  if (!UUID_RE.test(token)) return bad('bad_token', 'Upload token is missing or invalid.');

  const hash = await sha256(token.toLowerCase());
  const mine = await env.DB.prepare('SELECT character_name FROM uploaders WHERE token_hash = ?1')
    .bind(hash).first();
  if (!mine) return json({ success: true, items_removed: 0 });

  const [count] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM transmog_items WHERE character_name = ?1').bind(mine.character_name),
    env.DB.prepare('DELETE FROM transmog_items WHERE character_name = ?1').bind(mine.character_name),
    env.DB.prepare('DELETE FROM uploaders WHERE token_hash = ?1').bind(hash),
  ]);

  return json({ success: true, player_name: mine.character_name, items_removed: count.results[0].n });
}

// ── Reads ─────────────────────────────────────────────────────────────────────

async function search(env, params) {
  const q = (params.get('q') || '').trim();
  const loc = (params.get('loc') || '').trim();
  const limit = clampInt(params.get('limit'), 100, 1, MAX_SEARCH_LIMIT);
  const offset = clampInt(params.get('offset'), 0, 0, 1e9);

  const where = [];
  const binds = [];
  if (q) {
    binds.push(likePattern(q));
    const n = binds.length;
    where.push(`(ti.noun LIKE ?${n} ESCAPE '\\' OR ti.full_name LIKE ?${n} ESCAPE '\\' OR
                 ti.worn_location LIKE ?${n} ESCAPE '\\' OR ti.notes LIKE ?${n} ESCAPE '\\' OR
                 u.character_name LIKE ?${n} ESCAPE '\\')`);
  }
  if (loc) {
    binds.push(likePattern(loc));
    where.push(`ti.worn_location LIKE ?${binds.length} ESCAPE '\\'`);
  }
  binds.push(limit, offset);

  const sql = `
    SELECT u.character_name AS player_name, u.discord_name,
           ti.noun, ti.full_name, ti.worn_location, ti.price, ti.notes,
           u.last_upload, COUNT(*) OVER () AS total_count
      FROM transmog_items ti
      JOIN uploaders u ON u.character_name = ti.character_name
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ti.full_name COLLATE NOCASE
     LIMIT ?${binds.length - 1} OFFSET ?${binds.length}`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json(results, 200, 30);
}

async function stats(env) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS total_items, COUNT(DISTINCT character_name) AS total_players FROM transmog_items'
  ).first();
  return json(row, 200, 30);
}

async function players(env) {
  const { results } = await env.DB.prepare(
    'SELECT character_name FROM uploaders ORDER BY character_name COLLATE NOCASE'
  ).all();
  return json(results.map(r => r.character_name), 200, 30);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return bad('too_large', 'Upload is too large.', 413);
  const text = await request.text();
  if (text.length > MAX_BODY) return bad('too_large', 'Upload is too large.', 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object') throw new Error();
    return body;
  } catch {
    return bad('bad_json', 'Request body is not valid JSON.');
  }
}

function cleanText(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function clampInt(v, dflt, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function priceOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.floor(n), 2_000_000_000);
}

function likePattern(s) {
  return '%' + s.replace(/[\\%_]/g, c => '\\' + c) + '%';
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bad(error, message, status = 400) {
  return json({ error, message }, status);
}

function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}
