-- Transmog Exchange - v5 migration
-- Adds clear_transmog_player(), called by ;transmog_inventory clearweb confirm
-- Run in Supabase SQL Editor or via supabase_run.ps1.

-- ── clear_transmog_player ─────────────────────────────────────────────────────
-- Removes a player's uploader row (CASCADE deletes all their items) so they
-- no longer appear on the exchange. Their local CSV is unaffected. They can
-- re-upload any time to reappear.

CREATE OR REPLACE FUNCTION clear_transmog_player(
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name  TEXT;
  v_count INTEGER;
BEGIN
  SELECT character_name INTO v_name
    FROM uploaders
   WHERE token = p_token
   LIMIT 1;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object(
      'success',       true,
      'items_removed', 0
    );
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM transmog_items
   WHERE character_name = v_name;

  -- CASCADE on uploaders FK deletes all transmog_items for this player.
  DELETE FROM uploaders WHERE token = p_token;

  RETURN jsonb_build_object(
    'success',       true,
    'player_name',   v_name,
    'items_removed', v_count
  );
END;
$$;
