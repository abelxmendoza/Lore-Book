-- Entity Canonical Map
--
-- Bridges the three parallel entity systems (omega_entities, entities, people_places)
-- into a single address space anchored on omega_entities.id.
--
-- Strategy: additive — nothing is removed. source_table + source_id map to a
-- canonical omega_entity_id. Existing code keeps working; new code can do
-- cross-system joins through this table.
--
-- Also adds canonical_entity_id to entity_mentions so spreading activation
-- can follow omega_entity IDs instead of generic entity IDs.

CREATE TABLE IF NOT EXISTS entity_canonical_map (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_id     uuid NOT NULL REFERENCES omega_entities(id) ON DELETE CASCADE,
  source_table     text NOT NULL,  -- 'entities' | 'people_places' | 'characters'
  source_id        uuid NOT NULL,
  source_name      text,           -- denormalized for fast display
  confidence       float NOT NULL DEFAULT 1.0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ecm_user_id      ON entity_canonical_map (user_id);
CREATE INDEX IF NOT EXISTS idx_ecm_canonical_id ON entity_canonical_map (canonical_id);
CREATE INDEX IF NOT EXISTS idx_ecm_source       ON entity_canonical_map (source_table, source_id);

-- Add canonical_entity_id to entity_mentions so spreading activation can
-- optionally traverse omega_entities directly.
ALTER TABLE entity_mentions
  ADD COLUMN IF NOT EXISTS canonical_entity_id uuid REFERENCES omega_entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_em_canonical_entity_id
  ON entity_mentions (canonical_entity_id)
  WHERE canonical_entity_id IS NOT NULL;

-- Back-fill: where entity_mentions.entity_id already has a canonical map entry, set it.
-- This is a best-effort migration — unmatched rows stay NULL and get populated as
-- new ingestion runs.
UPDATE entity_mentions em
SET canonical_entity_id = ecm.canonical_id
FROM entity_canonical_map ecm
WHERE ecm.source_table = 'entities'
  AND ecm.source_id = em.entity_id
  AND em.canonical_entity_id IS NULL;

-- Seed canonical map from omega_entities ↔ people_places name match (best-effort).
-- Runs only where we can find a clear name match; low-confidence overlaps are skipped.
INSERT INTO entity_canonical_map (user_id, canonical_id, source_table, source_id, source_name, confidence)
SELECT DISTINCT
  oe.user_id,
  oe.id           AS canonical_id,
  'people_places' AS source_table,
  pp.id           AS source_id,
  pp.name         AS source_name,
  0.8             AS confidence
FROM omega_entities oe
JOIN people_places pp
  ON pp.user_id = oe.user_id
  AND lower(pp.name) = lower(oe.primary_name)
WHERE oe.type IN ('PERSON', 'CHARACTER', 'LOCATION')
ON CONFLICT (source_table, source_id) DO NOTHING;

-- RLS
ALTER TABLE entity_canonical_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own canonical map"
  ON entity_canonical_map
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
