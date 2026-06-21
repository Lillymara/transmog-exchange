-- Transmog Exchange — v4 migration
-- Fixes duplicate entries when a player changes their display name.
-- Run in Supabase SQL Editor (Database → SQL Editor → New query → Run).
--
-- Changes vs v3:
--   upload_transmog : Now identifies uploaders by TOKEN (not by display name).
--                     If you upload with the same token under a new name, the
--                     old name's data is automatically removed. No more duplicates.
--
-- FIRST: run this query to see current players and identify any duplicates:
--   SELECT u.character_name, COUNT(ti.id) AS items, u.last_upload
--     FROM uploaders u
--     LEFT JOIN transmog_items ti ON ti.character_name = u.character_name
--    GROUP BY u.character_name, u.last_upload
--    ORDER BY u.last_upload;
--
-- If you see your items listed twice under two different names, delete the
-- OLD one (replace 'OldName' with the name you no longer want):
--   DELETE FROM uploaders WHERE character_name = 'OldName';
--
-- Then re-upload with ;transmog_inventory upload to refresh the exchange.

-- ── upload_transmog (v4) ──────────────────────────────────────────────────────
-- Token is now the primary identifier. Name changes are handled automatically:
-- if the same token uploads under a different display name, the old entry is
-- deleted before the new one is created.

DROP FUNCTION IF EXISTS upload_transmog(text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS upload_transmog(text, uuid, jsonb, text, text);

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
  -- Look up the player by TOKEN (not by name) so rename is handled gracefully.
  SELECT character_name INTO v_existing_name
    FROM uploaders
   WHERE token = p_token
   LIMIT 1;

  IF v_existing_name IS NOT NULL THEN
    IF v_existing_name <> p_player_name THEN
      -- Same player, new display name.
      -- Check the desired new name isn't already claimed by a DIFFERENT token.
      IF EXISTS (
        SELECT 1 FROM uploaders
         WHERE character_name = p_player_name
           AND token <> p_token
      ) THEN
        RETURN jsonb_build_object(
          'error',   'name_claimed',
          'message', 'That display name is already in use by another uploader. '
                     'Choose a different name: ;transmog_inventory setname <name>.'
        );
      END IF;
      -- Remove old entry (CASCADE deletes their items).
      DELETE FROM uploaders WHERE token = p_token;
      -- Create fresh entry under the new name.
      INSERT INTO uploaders (character_name, token, discord_name)
        VALUES (p_player_name, p_token, p_discord_name);
    ELSE
      -- Same name — just refresh timestamp and discord handle.
      UPDATE uploaders
         SET last_upload  = now(),
             discord_name = COALESCE(p_discord_name, discord_name)
       WHERE token = p_token;
    END IF;
  ELSE
    -- First upload for this token. Make sure the desired name is available.
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

  -- Replace all items for this player.
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
