-- Transmog Exchange — Supabase Schema (v3)
-- Paste this entire file into Database → SQL Editor → New query, then Run.
-- For existing installs, run migrate_v3.sql instead.

-- ── Tables ───────────────────────────────────────────────────────────────────

-- One row per player (identified by their chosen display name + UUID token).
-- character_name stores the player's chosen display name (main char, alias, etc.)
CREATE TABLE IF NOT EXISTS uploaders (
  character_name  TEXT        PRIMARY KEY,
  token           UUID        NOT NULL,
  discord_name    TEXT        DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_upload     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per transmog item. character_name FK links to the player/uploader.
-- character records which alt owns the item (may differ from the player display name).
-- price is in silvers: NULL = not listed, 0 = free, positive = asking price.
CREATE TABLE IF NOT EXISTS transmog_items (
  id              BIGSERIAL   PRIMARY KEY,
  character_name  TEXT        NOT NULL REFERENCES uploaders(character_name) ON DELETE CASCADE,
  "character"     TEXT        NOT NULL DEFAULT '',
  noun            TEXT        NOT NULL,
  full_name       TEXT        NOT NULL,
  worn_location   TEXT        NOT NULL,
  quantity        INTEGER     NOT NULL DEFAULT 1,
  notes           TEXT        NOT NULL DEFAULT '' CHECK (char_length(notes) <= 120),
  price           INTEGER     DEFAULT NULL CHECK (price IS NULL OR price >= 0),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ti_char  ON transmog_items(character_name);
CREATE INDEX IF NOT EXISTS idx_ti_noun  ON transmog_items(noun);
CREATE INDEX IF NOT EXISTS idx_ti_loc   ON transmog_items(worn_location);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE uploaders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmog_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read; all writes go through SECURITY DEFINER functions below.
CREATE POLICY "public read uploaders"      ON uploaders      FOR SELECT USING (true);
CREATE POLICY "public read transmog_items" ON transmog_items FOR SELECT USING (true);

-- ── upload_transmog ───────────────────────────────────────────────────────────
-- Called by transmog_inventory.lic. Identifies uploaders by TOKEN (not name)
-- so display name changes are handled gracefully without creating duplicates.
-- Items carry "character" (which alt), "price" (silvers), and "notes".

CREATE OR REPLACE FUNCTION upload_transmog(
  p_player_name  TEXT,
  p_token        UUID,
  p_items        JSONB,
  p_discord_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_name TEXT;
BEGIN
  -- Look up by TOKEN so rename is handled automatically.
  SELECT character_name INTO v_existing_name
    FROM uploaders WHERE token = p_token LIMIT 1;

  IF v_existing_name IS NOT NULL THEN
    IF v_existing_name <> p_player_name THEN
      -- Same player, new display name. Check new name isn't taken by someone else.
      IF EXISTS (
        SELECT 1 FROM uploaders WHERE character_name = p_player_name AND token <> p_token
      ) THEN
        RETURN jsonb_build_object(
          'error',   'name_claimed',
          'message', 'That display name is already in use by another uploader. '
                     'Choose a different name: ;transmog_inventory setname <name>.'
        );
      END IF;
      DELETE FROM uploaders WHERE token = p_token;
      INSERT INTO uploaders (character_name, token, discord_name)
        VALUES (p_player_name, p_token, p_discord_name);
    ELSE
      UPDATE uploaders
         SET last_upload  = now(),
             discord_name = COALESCE(p_discord_name, discord_name)
       WHERE token = p_token;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM uploaders WHERE character_name = p_player_name) THEN
      RETURN jsonb_build_object(
        'error',   'name_claimed',
        'message', 'That display name is already in use by another uploader. '
                   'Make sure you are uploading from the same machine as before '
                   '(token is stored in transmog/transmog_config.json), '
                   'or choose a different name: ;transmog_inventory setname <name>.'
      );
    END IF;
    INSERT INTO uploaders (character_name, token, discord_name)
      VALUES (p_player_name, p_token, p_discord_name);
  END IF;

  DELETE FROM transmog_items WHERE character_name = p_player_name;

  INSERT INTO transmog_items
    (character_name, "character", noun, full_name, worn_location, quantity, notes, price)
  SELECT
    p_player_name,
    COALESCE(item->>'character', ''),
    item->>'noun',
    item->>'full_name',
    item->>'worn_location',
    COALESCE((item->>'quantity')::INTEGER, 1),
    COALESCE(item->>'notes', ''),
    CASE WHEN item->>'price' IS NULL THEN NULL
         ELSE (item->>'price')::INTEGER
    END
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object(
    'success',        true,
    'player_name',    p_player_name,
    'items_uploaded', jsonb_array_length(p_items)
  );
END;
$$;

-- ── search_transmog ───────────────────────────────────────────────────────────
-- Called by the web frontend. Returns player_name, discord_name, character (alt),
-- price, notes, and last_upload. Keyword search covers all text columns.

CREATE OR REPLACE FUNCTION search_transmog(
  p_query    TEXT    DEFAULT NULL,
  p_location TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  player_name   TEXT,
  discord_name  TEXT,
  "character"   TEXT,
  noun          TEXT,
  full_name     TEXT,
  worn_location TEXT,
  price         INTEGER,
  notes         TEXT,
  last_upload   TIMESTAMPTZ,
  total_count   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    u.character_name  AS player_name,
    u.discord_name,
    ti."character",
    ti.noun,
    ti.full_name,
    ti.worn_location,
    ti.price,
    ti.notes,
    u.last_upload,
    COUNT(*) OVER() AS total_count
  FROM transmog_items ti
  JOIN uploaders u ON u.character_name = ti.character_name
  WHERE
    (p_query IS NULL OR p_query = '' OR
      ti.noun          ILIKE '%' || p_query || '%' OR
      ti.full_name     ILIKE '%' || p_query || '%' OR
      ti.worn_location ILIKE '%' || p_query || '%' OR
      ti.notes         ILIKE '%' || p_query || '%' OR
      u.character_name ILIKE '%' || p_query || '%')
    AND
    (p_location IS NULL OR p_location = '' OR
      ti.worn_location ILIKE '%' || p_location || '%')
  ORDER BY ti.full_name
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- ── get_catalog_stats ─────────────────────────────────────────────────────────
-- Headline numbers for the web header.

CREATE OR REPLACE FUNCTION get_catalog_stats()
RETURNS TABLE (total_items BIGINT, total_players BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*) AS total_items,
         COUNT(DISTINCT character_name) AS total_players
  FROM transmog_items;
$$;
