-- Transmog Exchange - Cloudflare D1 (SQLite) schema
-- Apply with:  npx wrangler d1 execute transmog-exchange --remote --file=schema.sql
-- (use --local instead of --remote for the wrangler dev database)

-- One row per player. character_name is the display name chosen with
-- ;transmog_inventory setname. token_hash is the SHA-256 of the random UUID
-- the script keeps in transmog/transmog_config.json; the token itself is
-- never stored.
CREATE TABLE IF NOT EXISTS uploaders (
  character_name TEXT PRIMARY KEY COLLATE NOCASE,
  token_hash     TEXT NOT NULL UNIQUE,
  discord_name   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_upload    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row per item. "character" is the alt that owns it; it is stored but
-- never returned by the public search (alt names stay private).
-- price is in silvers: NULL = not listed, 0 = free.
CREATE TABLE IF NOT EXISTS transmog_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  character_name TEXT    NOT NULL REFERENCES uploaders(character_name) ON DELETE CASCADE ON UPDATE CASCADE,
  "character"    TEXT    NOT NULL DEFAULT '',
  noun           TEXT    NOT NULL,
  full_name      TEXT    NOT NULL,
  worn_location  TEXT    NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  notes          TEXT    NOT NULL DEFAULT '',
  price          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ti_char ON transmog_items(character_name);
CREATE INDEX IF NOT EXISTS idx_ti_name ON transmog_items(full_name);
