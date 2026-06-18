-- Transmog Exchange — v2 migration
-- Run this in Supabase SQL Editor (Database → SQL Editor → New query → Run).

-- ── Add notes column ──────────────────────────────────────────────────────────

ALTER TABLE transmog_items
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''
  CHECK (char_length(notes) <= 120);

-- ── upload_transmog (v2) ──────────────────────────────────────────────────────
-- Now accepts notes per item.

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

  INSERT INTO transmog_items (character_name, noun, full_name, worn_location, quantity, notes)
  SELECT
    p_character_name,
    item->>'noun',
    item->>'full_name',
    item->>'worn_location',
    COALESCE((item->>'quantity')::INTEGER, 1),
    COALESCE(item->>'notes', '')
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object(
    'success',        true,
    'character_name', p_character_name,
    'items_uploaded', jsonb_array_length(p_items)
  );
END;
$$;

-- ── search_transmog (v2) ──────────────────────────────────────────────────────
-- Returns notes and last_upload (from uploaders) instead of per-row uploaded_at.

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
  notes          TEXT,
  last_upload    TIMESTAMPTZ,
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
      ti.notes         ILIKE '%' || p_query || '%')
    AND
    (p_location IS NULL OR p_location = '' OR
      ti.worn_location ILIKE '%' || p_location || '%')
  ORDER BY ti.full_name
  LIMIT  p_limit
  OFFSET p_offset;
$$;
