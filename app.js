// ── Supabase config ───────────────────────────────────────────────────────────
// Replace these two values after creating your Supabase project.
// Settings → API → Project URL and anon public key.
const SUPABASE_URL      = 'https://tljiaclwqhbpdfiqkokh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_arwIDUqEwZL-jdqN4n9lhQ_ot6ABKbi';

// ── Worn-location filter options ──────────────────────────────────────────────
// Label shown in the dropdown → substring matched against worn_location column.
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

let state = { query: '', location: '', offset: 0, total: 0 };

// ── Supabase RPC helper ───────────────────────────────────────────────────────

async function rpc(name, params = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Render helpers ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setInfo(text) {
  document.getElementById('results-info').textContent = text;
}

function renderRows(rows) {
  const tbody = document.getElementById('results-body');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No items found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="col-char">${esc(r.character_name)}</td>
      <td class="col-noun">${esc(r.noun)}</td>
      <td class="col-name">${esc(r.full_name)}</td>
      <td class="col-loc">${esc(r.worn_location)}</td>
      <td class="col-qty">${r.quantity > 1 ? esc(r.quantity) : ''}</td>
    </tr>`).join('');
}

function renderPagination() {
  const pg    = document.getElementById('pagination');
  const pages = Math.ceil(state.total / PAGE_SIZE);
  const page  = Math.floor(state.offset / PAGE_SIZE) + 1;
  if (pages <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML = `
    <button id="pg-prev" ${page <= 1 ? 'disabled' : ''}>&#8592; Prev</button>
    <span class="page-info">Page ${page} of ${pages}</span>
    <button id="pg-next" ${page >= pages ? 'disabled' : ''}>Next &#8594;</button>`;
  document.getElementById('pg-prev').addEventListener('click', () => changePage(-1));
  document.getElementById('pg-next').addEventListener('click', () => changePage(+1));
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const [row] = await rpc('get_catalog_stats');
    const items = Number(row.total_items).toLocaleString();
    const chars = Number(row.total_characters);
    document.getElementById('stats').textContent =
      `${items} items from ${chars} character${chars !== 1 ? 's' : ''}`;
  } catch (e) {
    document.getElementById('stats').textContent = '';
    console.error('stats:', e);
  }
}

async function search() {
  const { query, location, offset } = state;

  document.getElementById('results-body').innerHTML =
    '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';
  setInfo('');
  document.getElementById('pagination').innerHTML = '';

  try {
    const rows = await rpc('search_transmog', {
      p_query:    query    || null,
      p_location: location || null,
      p_limit:    PAGE_SIZE,
      p_offset:   offset,
    });

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

    renderPagination();
  } catch (e) {
    document.getElementById('results-body').innerHTML =
      `<tr><td colspan="5" class="empty-state">Error loading results: ${esc(e.message)}</td></tr>`;
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
  state.query    = document.getElementById('query').value.trim();
  state.location = document.getElementById('location-filter').value;
  state.offset   = 0;
  search();
}

document.addEventListener('DOMContentLoaded', () => {
  // Populate location dropdown
  const sel = document.getElementById('location-filter');
  sel.innerHTML = LOCATIONS.map(([label, val]) =>
    `<option value="${esc(val)}">${esc(label)}</option>`
  ).join('');

  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('query').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  loadStats();
  search(); // show first 100 items on page load
});
