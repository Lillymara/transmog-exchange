-- Transmog Exchange — Supabase Schema
-- Paste this entire file into Database → SQL Editor → New query, then Run.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploaders (
  character_name  TEXT        PRIMARY KEY,
  token           UUID        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_upload     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transmog_items (
  id              BIGSERIAL   PRIMARY KEY,
  character_name  TEXT        NOT NULL REFERENCES uploaders(character_name) ON DELETE CASCADE,
  noun            TEXT        NOT NULL,
  full_name       TEXT        NOT NULL,
  worn_location   TEXT        NOT NULL,
  quantity        INTEGER     NOT NULL DEFAULT 1,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ti_char  ON transmog_items(character_name);
CREATE INDEX IF NOT EXISTS idx_ti_noun  ON transmog_items(noun);
CREATE INDEX IF NOT EXISTS idx_ti_loc   ON transmog_items(worn_location);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE uploaders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transmog_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read; writes go through the functions below (SECURITY DEFINER).
CREATE POLICY "public read uploaders"      ON uploaders      FOR SELECT USING (true);
CREATE POLICY "public read transmog_items" ON transmog_items FOR SELECT USING (true);

-- ── upload_transmog ───────────────────────────────────────────────────────────
-- Called by transmog_inventory.lic.  Validates the uploader token, claims the
-- character name on first upload, then replaces all items for that character.

CREATE OR REPLACE FUNCTION upload_transmog(
  p_character_name TEXT,
  p_token          UUID,
  p_items          JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
BEGIN
  SELECT token INTO v_existing FROM uploaders WHERE character_name = p_character_name;

  IF v_existing IS NULL THEN
    -- First upload: claim the character name.
    INSERT INTO uploaders (character_name, token) VALUES (p_character_name, p_token);
  ELSIF v_existing <> p_token THEN
    RETURN jsonb_build_object(
      'error',   'character_claimed',
      'message', 'That character name is already claimed by another uploader. '
                 'If this is your character, make sure you are uploading from the '
                 'same machine that originally uploaded it (token is stored in '
                 'transmog/transmog_config.json).'
    );
  ELSE
    UPDATE uploaders SET last_upload = now() WHERE character_name = p_character_name;
  END IF;

  DELETE FROM transmog_items WHERE character_name = p_character_name;

  INSERT INTO transmog_items (character_name, noun, full_name, worn_location, quantity)
  SELECT
    p_character_name,
    item->>'noun',
    item->>'full_name',
    item->>'worn_location',
    COALESCE((item->>'quantity')::INTEGER, 1)
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object(
    'success',        true,
    'character_name', p_character_name,
    'items_uploaded', jsonb_array_length(p_items)
  );
END;
$$;

-- ── search_transmog ───────────────────────────────────────────────────────────
-- Called by the web frontend.  Keyword search across noun/name/location with
-- an optional location filter.  Returns matching rows plus a total_count
-- window-function column so one call covers both data and pagination.

CREATE OR REPLACE FUNCTION search_transmog(
  p_query    TEXT    DEFAULT NULL,
  p_location TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  character_name TEXT,
  noun           TEXT,
  full_name      TEXT,
  worn_location  TEXT,
  quantity       INTEGER,
  uploaded_at    TIMESTAMPTZ,
  total_count    BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ti.character_name,
    ti.noun,
    ti.full_name,
    ti.worn_location,
    ti.quantity,
    ti.uploaded_at,
    COUNT(*) OVER() AS total_count
  FROM transmog_items ti
  WHERE
    (p_query IS NULL OR p_query = '' OR
      ti.noun          ILIKE '%' || p_query || '%' OR
      ti.full_name     ILIKE '%' || p_query || '%' OR
      ti.worn_location ILIKE '%' || p_query || '%')
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
RETURNS TABLE (total_items BIGINT, total_characters BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*) AS total_items, COUNT(DISTINCT character_name) AS total_characters
  FROM transmog_items;
$$;
