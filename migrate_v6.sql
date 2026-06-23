-- Transmog Exchange - v6 migration
-- Removes the "character" (alt name) column from search_transmog() so it is
-- never returned to the browser. Alt names remain stored in the DB for the
-- Lich script's local char: filtering, but the public RPC no longer exposes them.

DROP FUNCTION IF EXISTS search_transmog(text, text, integer, integer);

CREATE OR REPLACE FUNCTION search_transmog(
  p_query    TEXT    DEFAULT NULL,
  p_location TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  player_name   TEXT,
  discord_name  TEXT,
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
