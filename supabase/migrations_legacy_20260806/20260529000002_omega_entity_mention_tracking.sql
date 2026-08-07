-- Trust floor: entity mention tracking.
--
-- New entities created by the ingestion pipeline start as 'mentioned_only'
-- until they appear in a second conversation, at which point they are promoted
-- to 'confirmed'.  This prevents single weak LLM extractions from polluting
-- the entity graph with ghost characters.
--
-- Existing entities (pre-migration) are set to 'confirmed' since they were
-- created under human-initiated flows or have already accumulated history.

ALTER TABLE omega_entities
  ADD COLUMN IF NOT EXISTS mention_count  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mention_status text    NOT NULL DEFAULT 'confirmed';

-- Enforce valid states
ALTER TABLE omega_entities
  DROP CONSTRAINT IF EXISTS omega_entities_mention_status_check;

ALTER TABLE omega_entities
  ADD CONSTRAINT omega_entities_mention_status_check
    CHECK (mention_status IN ('mentioned_only', 'confirmed', 'canonical'));

-- Backfill: any entity that was created before this migration is already
-- confirmed (we don't have accurate mention_count history for them).
UPDATE omega_entities
SET mention_status = 'confirmed'
WHERE mention_status != 'confirmed';

-- Index for filtering out weak mentions at query time
CREATE INDEX IF NOT EXISTS idx_omega_entities_user_status
  ON omega_entities (user_id, mention_status);
