-- Performance indexes for entity resolution hot paths.
-- Eliminates sequential scans in batchLoadUsageCounts() and resolveEntities().

-- entity_unit_links: primary join in usage-count batch load
CREATE INDEX IF NOT EXISTS idx_entity_unit_links_entity_id
  ON entity_unit_links (entity_id);

-- composite for type-filtered scans (used in resolveEntities batch load per type)
CREATE INDEX IF NOT EXISTS idx_entity_unit_links_entity_id_type
  ON entity_unit_links (entity_id, entity_type)
  WHERE entity_type IS NOT NULL;

-- character_memories: fallback count path in batchLoadUsageCounts
CREATE INDEX IF NOT EXISTS idx_character_memories_character_id
  ON character_memories (character_id);

-- location_mentions: fallback count path
CREATE INDEX IF NOT EXISTS idx_location_mentions_location_id
  ON location_mentions (location_id);

-- entity_mentions: fallback count path
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity_id
  ON entity_mentions (entity_id);

-- omega_entities: user+type filter is the hot path in resolveEntities batch load
CREATE INDEX IF NOT EXISTS idx_omega_entities_user_type
  ON omega_entities (user_id, type);

-- omega_claims: entity + active filter for context assembly
CREATE INDEX IF NOT EXISTS idx_omega_claims_entity_active
  ON omega_claims (entity_id, is_active)
  WHERE is_active = true;

-- journal_entries: date-ordered fetch (used in every engine buildContext)
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date
  ON journal_entries (user_id, date DESC);
