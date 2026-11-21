// ── API (Cloudflare Worker, same origin: /transmog/api/) ─────────────────────
const API = new URL('api/', document.baseURI).href;

// ── Worn-location filter options ──────────────────────────────────────────────
const LOCATIONS = [
  ['All Locations',                ''],
  ['Fingers',                      'fingers'],
  ['Neck',                         'neck'],
  ['Wrist',                        'wrist'],
  ['Around Waist',                 'around your waist'],
  ['Belt Attachment',              'to your belt'],
  ['Ankle',                        'ankle'],
  ['Shoulders (cloak/cape)',       'over your shoulders'],
  ['Shoulder Sling (bag/baldric)', 'over your shoulder'],
  ['Back',                         'your back'],
  ['Head',                         'your head'],
  ['Hair',                         'your hair'],
  ['Both Ears',                    'both ears'],
  ['Single Ear',                   'single ear'],
  ['Chest (over)',                 'over your chest'],
  ['Chest (undershirt)',           'into, on your chest'],
  ['Legs',                         'your legs'],
  ['Feet',                         'feet'],
  ['Arms',                         'your arms'],
  ['Hands',                        'your hands'],
  ['Front (apron/corset/tabard)',  'your front'],
  ['Pin',                          'as a pin'],
];

const PAGE_SIZE = 100;

let state = {
  query:       '',
  location:    '',
  player:      '',
  priceFilter: '',
  sortBy:      'name-asc',
  offset:      0,
  total:       0,
  _allRows:    null,  // cached rows for client-side mode
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path, params = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Boolean query parser ──────────────────────────────────────────────────────
//
// Grammar (precedence: NOT > AND > OR):
//   expr     := or_expr
//   or_expr  := and_expr (OR and_expr)*
//   and_expr := not_expr ((AND | implicit) not_expr)*
//   not_expr := (NOT | -) primary | primary
//   primary  := '(' expr ')' | term
//
// Field scopes:
//   noun: / n:          → noun column
//   name: / full: / f:  → full_name column
//   loc: / location: / worn: / l: → worn_location column
//   char: / character: / c: / player: → player_name OR character (alt)

function _parseFieldScope(token) {
  const m = token.match(/^(noun|n|name|full|f|loc|location|worn|l|char|character|c|player)[=:](.+)$/i);
  if (!m) return [null, token];
  const f = m[1].toLowerCase();
  const col =
    /^(noun|n)$/.test(f)                  ? 'noun'           :
    /^(name|full|f)$/.test(f)             ? 'full_name'      :
    /^(char|character|c|player)$/.test(f) ? 'player_or_char' :
                                             'worn_location';
  return [col, m[2]];
}

function tokenizeBool(q) {
  const tokens = [];
  let s = (q || '').trim();
  while (s.length) {
    s = s.replace(/^\s+/, '');
    if (!s.length) break;
    if (s[0] === '(')                          { tokens.push({ type: 'lparen' });                                              s = s.slice(1); }
    else if (s[0] === ')')                     { tokens.push({ type: 'rparen' });                                              s = s.slice(1); }
    else if (/^-(?=\S)/.test(s))              { tokens.push({ type: 'not' });                                                 s = s.slice(1); }
    else if (/^AND\b/i.test(s))               { tokens.push({ type: 'and' });                                                 s = s.replace(/^AND\b/i, ''); }
    else if (/^OR\b/i.test(s))                { tokens.push({ type: 'or' });                                                  s = s.replace(/^OR\b/i, '');  }
    else if (/^NOT\b/i.test(s))               { tokens.push({ type: 'not' });                                                 s = s.replace(/^NOT\b/i, ''); }
    else if (/^"((?:[^"\\]|\\.)*)"/.test(s)) { const m = s.match(/^"((?:[^"\\]|\\.)*)"/);  tokens.push({ type: 'word', value: m[1] }); s = s.slice(m[0].length); }
    else                                      { const m = s.match(/^(\S+)/);                 tokens.push({ type: 'word', value: m[1] }); s = s.slice(m[0].length); }
  }
  return tokens;
}

function parseBool(tokens) {
  const [node] = _boolOr(tokens, 0);
  return node;
}

function _boolOr(tokens, pos) {
  let [left, p] = _boolAnd(tokens, pos);
  while (tokens[p]?.type === 'or') {
    const [right, p2] = _boolAnd(tokens, p + 1);
    left = ['or', left, right];
    p = p2;
  }
  return [left, p];
}

function _boolAnd(tokens, pos) {
  let [left, p] = _boolNot(tokens, pos);
  while (true) {
    const tok = tokens[p];
    if (!tok) break;
    if (tok.type === 'and') {
      const [right, p2] = _boolNot(tokens, p + 1);
      left = ['and', left, right]; p = p2;
    } else if (['word', 'not', 'lparen'].includes(tok.type)) {
      const [right, p2] = _boolNot(tokens, p);
      left = ['and', left, right]; p = p2;
    } else break;
  }
  return [left, p];
}

function _boolNot(tokens, pos) {
  if (tokens[pos]?.type === 'not') {
    const [child, p] = _boolPrimary(tokens, pos + 1);
    return [['not', child], p];
  }
  return _boolPrimary(tokens, pos);
}

function _boolPrimary(tokens, pos) {
  const tok = tokens[pos];
  if (!tok) return [['all'], pos];
  if (tok.type === 'lparen') {
    let [node, p] = _boolOr(tokens, pos + 1);
    if (tokens[p]?.type === 'rparen') p++;
    return [node, p];
  }
  if (tok.type === 'word') {
    const [col, val] = _parseFieldScope(tok.value);
    return [['term', col, val], pos + 1];
  }
  return [['all'], pos];
}

function evalBool(node, row) {
  switch (node[0]) {
    case 'all': return true;
    case 'term': {
      const [, col, value] = node;
      const needle = value.toLowerCase();
      if (!col) {
        return ['noun', 'full_name', 'worn_location', 'player_name', 'notes'].some(
          k => String(row[k] ?? '').toLowerCase().includes(needle)
        );
      }
      if (col === 'player_or_char') {
        return String(row.player_name ?? '').toLowerCase().includes(needle);
      }
      return String(row[col] ?? '').toLowerCase().includes(needle);
    }
    case 'and': return evalBool(node[1], row) && evalBool(node[2], row);
    case 'or':  return evalBool(node[1], row) || evalBool(node[2], row);
    case 'not': return !evalBool(node[1], row);
    default: return true;
  }
}

// Returns true when the query contains boolean operators or field scopes.
// Simple keyword searches (no operators) keep using fast server-side LIKE.
function isBoolQuery(q) {
  if (!q) return false;
  return /\b(OR|NOT)\b/i.test(q)                                                            ||
         /[()"]/.test(q)                                                                    ||
         /(?:^|\s)-\S/.test(q)                                                              ||
         /(?:noun|n|name|full|f|loc|location|worn|l|char|character|c|player)[=:]/i.test(q);
}

// ── Filter / sort ─────────────────────────────────────────────────────────────

// Any non-default filter or sort requires fetching all rows and working client-side.
function needsClientMode() {
  return isBoolQuery(state.query)
      || state.player      !== ''
      || state.priceFilter !== ''
      || state.sortBy      !== 'name-asc';
}

function filterRows(rows) {
  const node    = isBoolQuery(state.query) ? parseBool(tokenizeBool(state.query)) : null;
  const simpleQ = (!isBoolQuery(state.query) && state.query) ? state.query.toLowerCase() : null;
  const COLS    = ['noun', 'full_name', 'worn_location', 'player_name', 'notes'];

  return rows.filter(r => {
    if (node    && !evalBool(node, r))                                   return false;
    if (simpleQ && !COLS.some(k => String(r[k] ?? '').toLowerCase().includes(simpleQ))) return false;
    if (state.player      && r.player_name !== state.player)             return false;
    if (state.priceFilter === 'priced' && r.price == null)               return false;
    if (state.priceFilter === 'free'   && r.price !== 0)                 return false;
    return true;
  });
}

function sortRows(rows) {
  const s = [...rows];
  switch (state.sortBy) {
    case 'name-desc':
      s.sort((a, b) => (b.full_name || '').localeCompare(a.full_name || ''));
      break;
    case 'price-asc':
      s.sort((a, b) => {
        if (a.price == null && b.price == null) return 0;
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return a.price - b.price;
      });
      break;
    case 'price-desc':
      s.sort((a, b) => {
        if (a.price == null && b.price == null) return 0;
        if (a.price == null) return 1;
        if (b.price == null) return -1;
        return b.price - a.price;
      });
      break;
    case 'updated':
      s.sort((a, b) => new Date(b.last_upload) - new Date(a.last_upload));
      break;
    default:
      s.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }
  return s;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60)          return 'just now';
  if (seconds < 3600)        return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)       return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30)  return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / (86400 * 30))}mo ago`;
  return `${Math.floor(seconds / (86400 * 365))}y ago`;
}

function formatPrice(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return '<span class="price-free">Free</span>';
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}m silvers`;
  if (n >= 1_000     && n % 1_000     === 0) return `${n / 1_000}k silvers`;
  return `${n.toLocaleString()} silvers`;
}

// Clipboard API first; older browsers and some embedded views only allow
// the execCommand fallback.
function copyText(text) {
  const fallback = () => new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    ok ? resolve() : reject(new Error('copy failed'));
  });
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(fallback);
  }
  return fallback();
}

// Short messages for screen readers (e.g. "Copied").
function announce(text) {
  let el = document.getElementById('sr-announce');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sr-announce';
    el.className = 'sr-only';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

function setInfo(text) {
  document.getElementById('results-info').textContent = text;
}

function renderRows(rows) {
  const tbody = document.getElementById('results-body');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No items found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const discordPart = r.discord_name
      ? `<button type="button" class="discord-copy" data-handle="${esc(r.discord_name)}" aria-label="Copy Discord username ${esc(r.discord_name)}">${esc(r.discord_name)}<span class="copy-tag" aria-hidden="true">Copy</span></button>` : '';
    return `
    <tr>
      <td class="col-char"><span class="player-name">${esc(r.player_name)}</span>${discordPart}</td>
      <td class="col-noun">${esc(r.noun)}</td>
      <td class="col-name">${esc(r.full_name)}</td>
      <td class="col-loc">${esc(r.worn_location)}</td>
      <td class="col-price">${formatPrice(r.price)}</td>
      <td class="col-notes">${esc(r.notes)}</td>
      <td class="col-updated"><time datetime="${esc(r.last_upload)}" title="${esc(new Date(r.last_upload).toLocaleString())}">${timeAgo(r.last_upload)}</time></td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const pg    = document.getElementById('pagination');
  const pages = Math.ceil(state.total / PAGE_SIZE);
  const page  = Math.floor(state.offset / PAGE_SIZE) + 1;
  if (pages <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML = `
    <button type="button" id="pg-prev" aria-label="Previous page" ${page <= 1 ? 'disabled' : ''}>&#8592; Prev</button>
    <span class="page-info" aria-current="page">Page ${page} of ${pages}</span>
    <button type="button" id="pg-next" aria-label="Next page" ${page >= pages ? 'disabled' : ''}>Next &#8594;</button>`;
  document.getElementById('pg-prev').addEventListener('click', () => changePage(-1));
  document.getElementById('pg-next').addEventListener('click', () => changePage(+1));
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const row     = await apiGet('stats');
    const items   = Number(row.total_items).toLocaleString();
    const players = Number(row.total_players);
    document.getElementById('stats').textContent =
      `${items} items from ${players} player${players !== 1 ? 's' : ''}`;
  } catch (e) {
    document.getElementById('stats').textContent = '';
    console.error('stats:', e);
  }
}

async function loadPlayers() {
  try {
    const players = await apiGet('players');
    const sel = document.getElementById('player-filter');
    sel.innerHTML = '<option value="">All players</option>' +
      players.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  } catch (e) {
    console.error('loadPlayers:', e);
  }
}

async function search() {
  const { query, location, offset } = state;

  document.getElementById('results-body').innerHTML =
    '<tr><td colspan="7" class="empty-state">Loading…</td></tr>';
  setInfo('');
  document.getElementById('pagination').innerHTML = '';

  try {
    if (needsClientMode()) {
      // ── Client-side mode: fetch all rows once, filter + sort in JS ──────────
      if (!state._allRows) {
        state._allRows = await apiGet('search', { loc: location, limit: 10000 });
      }

      const filtered = filterRows(state._allRows);
      const sorted   = sortRows(filtered);
      state.total    = sorted.length;
      const page     = sorted.slice(offset, offset + PAGE_SIZE);

      renderRows(page);

      if (sorted.length === 0) {
        setInfo('No results.');
      } else {
        const from = offset + 1;
        const to   = Math.min(offset + PAGE_SIZE, sorted.length);
        setInfo(`Showing ${from}–${to} of ${sorted.length.toLocaleString()} item${sorted.length !== 1 ? 's' : ''}.`);
      }

    } else {
      // ── Server-side mode: ILIKE search with server pagination ───────────────
      state._allRows = null;

      const rows = await apiGet('search', { q: query, loc: location, limit: PAGE_SIZE, offset });

      state.total = rows.length > 0 ? Number(rows[0].total_count) : 0;
      renderRows(rows);

      if (state.total === 0) {
        setInfo('No results.');
      } else {
        const from = offset + 1;
        const to   = offset + rows.length;
        const tot  = state.total.toLocaleString();
        setInfo(`Showing ${from}–${to} of ${tot} item${state.total !== 1 ? 's' : ''}.`);
      }
    }

    renderPagination();
  } catch (e) {
    document.getElementById('results-body').innerHTML =
      `<tr><td colspan="7" class="empty-state">Error loading results: ${esc(e.message)}</td></tr>`;
    console.error('search:', e);
  }
}

function changePage(delta) {
  const newOffset = state.offset + delta * PAGE_SIZE;
  if (newOffset < 0 || newOffset >= state.total) return;
  state.offset = newOffset;
  search();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function doSearch() {
  state.query       = document.getElementById('query').value.trim();
  state.location    = document.getElementById('location-filter').value;
  state.player      = document.getElementById('player-filter').value;
  state.priceFilter = document.getElementById('price-filter').value;
  state.sortBy      = document.getElementById('sort-by').value;
  state.offset      = 0;
  state._allRows    = null;  // clear cache so filters re-apply on next fetch
  search();
}

document.addEventListener('DOMContentLoaded', () => {
  // Populate location dropdown
  const locSel = document.getElementById('location-filter');
  locSel.innerHTML = LOCATIONS.map(([label, val]) =>
    `<option value="${esc(val)}">${esc(label === 'All Locations' ? 'All locations' : label)}</option>`
  ).join('');

  // Wire up search controls
  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault();
    doSearch();
  });

  // Filter dropdowns auto-search on change
  ['location-filter', 'player-filter', 'price-filter', 'sort-by'].forEach(id => {
    document.getElementById(id).addEventListener('change', doSearch);
  });

  // Click-to-copy Discord handles
  document.addEventListener('click', e => {
    const el = e.target.closest('.discord-copy');
    if (!el) return;
    const handle = el.dataset.handle;
    const tag    = el.querySelector('.copy-tag');
    const show = (text, ok) => {
      el.classList.toggle('discord-copied', ok);
      if (tag) tag.textContent = text;
      setTimeout(() => {
        el.classList.remove('discord-copied');
        if (tag) tag.textContent = 'Copy';
      }, ok ? 1600 : 2600);
    };
    copyText(handle).then(() => {
      show('Copied!', true);
      announce(`Copied ${handle} to the clipboard.`);
    }).catch(() => {
      show("Couldn't copy", false);
      announce(`Could not copy. The Discord name is ${handle}.`);
    });
  });

  loadStats();
  loadPlayers();
  search();
});
