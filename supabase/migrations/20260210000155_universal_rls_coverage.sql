-- =====================================================
-- UNIVERSAL RLS COVERAGE
-- Identity Integrity Sprint — Phase 1
--
-- Audit found 26 user-data tables without RLS enabled.
-- All have a user_id uuid column referencing auth.users.
-- System tables (engine_*, embeddings_cache) intentionally
-- excluded: they have no user_id and are service-role-only.
--
-- Policy pattern for all tables:
--   USING (auth.uid() = user_id)          — read own rows
--   WITH CHECK (auth.uid() = user_id)     — write own rows
--
-- Supabase service role bypasses RLS by default.
-- Server-side supabaseAdmin client uses service role,
-- so existing backend workflows are unaffected.
--
-- Idempotent: safe to re-run (IF NOT EXISTS on policies,
-- enabling RLS on an already-RLS table is a no-op).
-- =====================================================

-- ─── Helper: enable RLS idempotently ─────────────────────────────────────────
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent in Postgres 15+)

-- ─── 1. biometric_measurements ───────────────────────────────────────────────
ALTER TABLE IF EXISTS biometric_measurements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'biometric_measurements' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON biometric_measurements
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 2. chapters ─────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS chapters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chapters' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON chapters
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 3. entity_resolution_cache ──────────────────────────────────────────────
ALTER TABLE IF EXISTS entity_resolution_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'entity_resolution_cache' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON entity_resolution_cache
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 4. entry_verifications ──────────────────────────────────────────────────
ALTER TABLE IF EXISTS entry_verifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'entry_verifications' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON entry_verifications
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 5. fact_claims ──────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS fact_claims ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fact_claims' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON fact_claims
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 6. fact_verifications ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS fact_verifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fact_verifications' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON fact_verifications
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 7. interest_mentions ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS interest_mentions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interest_mentions' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON interest_mentions
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 8. interest_scope_groups ────────────────────────────────────────────────
ALTER TABLE IF EXISTS interest_scope_groups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interest_scope_groups' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON interest_scope_groups
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 9. interest_scopes ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS interest_scopes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interest_scopes' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON interest_scopes
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 10. interests ───────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS interests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interests' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON interests
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 11. perception_entries ──────────────────────────────────────────────────
ALTER TABLE IF EXISTS perception_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'perception_entries' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON perception_entries
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 12. timeline_actions ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_actions' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_actions
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 13. timeline_arcs ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_arcs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_arcs' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_arcs
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 14. timeline_epochs ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_epochs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_epochs' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_epochs
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 15. timeline_eras ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_eras ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_eras' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_eras
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 16. timeline_microactions ───────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_microactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_microactions' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_microactions
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 17. timeline_mythos ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_mythos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_mythos' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_mythos
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 18. timeline_sagas ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_sagas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_sagas' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_sagas
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 19. timeline_scenes ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_scenes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_scenes' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_scenes
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 20. timeline_search_index ───────────────────────────────────────────────
ALTER TABLE IF EXISTS timeline_search_index ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timeline_search_index' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON timeline_search_index
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 21. training_datasets ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS training_datasets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_datasets' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON training_datasets
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 22. user_corrections ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS user_corrections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_corrections' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON user_corrections
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 23. value_evolution_events ──────────────────────────────────────────────
ALTER TABLE IF EXISTS value_evolution_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'value_evolution_events' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON value_evolution_events
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 24. value_priority_history ──────────────────────────────────────────────
ALTER TABLE IF EXISTS value_priority_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'value_priority_history' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON value_priority_history
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 25. value_rankings ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS value_rankings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'value_rankings' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON value_rankings
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 26. workout_events ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS workout_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workout_events' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY "owner_rw" ON workout_events
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Intentionally excluded (no user_id = system/shared tables) ───────────────
-- embeddings_cache   — shared inference cache, service-role-only by architecture
-- engine_blueprints  — system engine definitions, no user rows
-- engine_dependencies — system config, no user rows
-- engine_embeddings  — system embeddings, no user rows
-- engine_health      — system health metrics, no user rows
-- engine_manifest    — system config registry, no user rows
