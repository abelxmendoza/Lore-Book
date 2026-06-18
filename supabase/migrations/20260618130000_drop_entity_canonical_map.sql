-- Drop dead entity_canonical_map bridge table.
--
-- Superseded by character_authority_map (20260616140000_character_authority_map.sql).
-- Zero application readers/writers in apps/server/src (verified 2026-06-18).
-- entity_mentions.canonical_entity_id is retained — populated by ingestion, not this table.

DROP POLICY IF EXISTS "Users access own canonical map" ON entity_canonical_map;

DROP TABLE IF EXISTS entity_canonical_map;
