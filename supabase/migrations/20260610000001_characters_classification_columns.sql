-- =====================================================
-- CHARACTERS CLASSIFICATION COLUMNS
-- The app (routes/characters.ts, CharacterBook filters) reads and writes
-- importance/proximity/relationship classification fields that were never
-- migrated onto the characters table. Without them:
--   - POST /api/characters fails (unknown columns in insert payload)
--   - every category/proximity filter in the Characters Book is empty
--     for real data
-- All columns are additive and nullable/defaulted — safe to apply live.
-- =====================================================

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS is_nickname boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS importance_level text NOT NULL DEFAULT 'minor',
  ADD COLUMN IF NOT EXISTS importance_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximity_level text,
  ADD COLUMN IF NOT EXISTS has_met boolean,
  ADD COLUMN IF NOT EXISTS relationship_depth text,
  ADD COLUMN IF NOT EXISTS associated_with_character_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentioned_by_character_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context_of_mention text,
  ADD COLUMN IF NOT EXISTS likelihood_to_meet text;

-- Backfill chat-promoted characters with honest classification:
-- mentioned_only depth (they were extracted from conversation, the user
-- hasn't confirmed the relationship) and importance from mention count.
UPDATE characters
SET
  relationship_depth = COALESCE(relationship_depth, 'mentioned_only'),
  importance_level = CASE
    WHEN COALESCE((metadata->>'mention_count')::int, 1) >= 6 THEN 'major'
    WHEN COALESCE((metadata->>'mention_count')::int, 1) >= 3 THEN 'supporting'
    ELSE 'minor'
  END
WHERE metadata->>'generated_by' = 'chat_extraction'
  AND relationship_depth IS NULL;

-- Index for the importance filter (most common non-default filter)
CREATE INDEX IF NOT EXISTS idx_characters_user_importance
  ON characters (user_id, importance_level);
