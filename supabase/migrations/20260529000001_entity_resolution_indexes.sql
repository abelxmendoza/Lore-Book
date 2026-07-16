-- Performance indexes for entity resolution hot paths.
-- Guard each target: some tables may not exist on every Preview replay path.

DO $$
BEGIN
  IF to_regclass('public.entity_unit_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_entity_unit_links_entity_id
      ON entity_unit_links (entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_unit_links_entity_id_type
      ON entity_unit_links (entity_id, entity_type)
      WHERE entity_type IS NOT NULL;
  END IF;

  IF to_regclass('public.character_memories') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_character_memories_character_id
      ON character_memories (character_id);
  END IF;

  IF to_regclass('public.location_mentions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_location_mentions_location_id
      ON location_mentions (location_id);
  END IF;

  IF to_regclass('public.entity_mentions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity_id
      ON entity_mentions (entity_id);
  END IF;

  IF to_regclass('public.omega_entities') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_omega_entities_user_type
      ON omega_entities (user_id, type);
  END IF;

  IF to_regclass('public.omega_claims') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_omega_claims_entity_active
      ON omega_claims (entity_id, is_active)
      WHERE is_active = true;
  END IF;

  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date
      ON journal_entries (user_id, date DESC);
  END IF;
END $$;
