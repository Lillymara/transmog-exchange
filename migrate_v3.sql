-- Transmog Exchange — v3 migration
-- Run in Supabase SQL Editor (Database → SQL Editor → New query → Run).
-- Or: .\supabase_run.ps1 migrate_v3.sql
--
-- Changes vs v2:
--   uploaders       : add discord_name column
--   transmog_items  : add character (which alt) and price (silvers, 0 = free) columns
--   upload_transmog : p_character_name → p_player_name; add p_discord_name;
--                     items now carry "character" and "price" fields
--   search_transmog : returns player_name, discord_name, character, price
--   get_catalog_stats: total_characters → total_players
--
-- NOTE: existing rows in `uploaders` keep their character_name values as the
-- player display name. If you want to rename an existing uploader (e.g. from
-- "Lisadiro" to "Mara"), delete the old row first:
--   DELETE FROM uploaders WHERE character_name = 'Lisadiro';
-- Then re-upload with ;transmog_inventory setname Mara + ;transmog_inventory upload.

-- ── Schema changes ────────────────────────────────────────────────────────────

ALTER TABLE uploaders
  ADD COLUMN IF NOT EXISTS discord_name TEXT DEFAULT NULL;

ALTER TABLE transmog_items
  ADD COLUMN IF NOT EXISTS "character" TEXT NOT NULL DEFAULT '';

ALTER TABLE transmog_items
  ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_transmog_price' AND conrelid = 'transmog_items'::regclass
  ) THEN
    ALTER TABLE transmog_items
      ADD CONSTRAINT chk_transmog_price CHECK (price IS NULL OR price >= 0);
  END IF;
END;
$$;

-- ── upload_transmog (v3) ──────────────────────────────────────────────────────
-- p_character_name renamed to p_player_name.
-- p_discord_name added (optional).
-- Items now carry "character" (which alt) and "price" (silvers, null = not set).

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
  v_existing UUID;
BEGIN
  SELECT token INTO v_existing FROM uploaders WHERE character_name = p_player_name;

  IF v_existing IS NULL THEN
    INSERT INTO uploaders (character_name, token, discord_name)
      VALUES (p_player_name, p_token, p_discord_name);
  ELSIF v_existing <> p_token THEN
    RETURN jsonb_build_object(
      'error',   'name_claimed',
      'message', 'That player name is already claimed by another uploader. '
                 'Make sure you are uploading from the same machine that originally '
                 'uploaded it (token is stored in transmog/transmog_config.json). '
                 'Or choose a different display name: ;transmog_inventory setname <name>.'
    );
  ELSE
    UPDATE uploaders
       SET last_upload  = now(),
           discord_name = COALESCE(p_discord_name, discord_name)
     WHERE character_name = p_player_name;
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

-- ── search_transmog (v3) ──────────────────────────────────────────────────────
-- Returns player_name, discord_name, character (alt), price in addition to
-- existing fields. Query now also searches player_name column.

-- Must drop first because the return type (new columns) changed.
DROP FUNCTION IF EXISTS search_transmog(text,text,integer,integer);

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

-- ── get_catalog_stats (v3) ────────────────────────────────────────────────────
-- total_characters renamed to total_players.

-- Must drop first because the return type (column renamed) changed.
DROP FUNCTION IF EXISTS get_catalog_stats();

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
