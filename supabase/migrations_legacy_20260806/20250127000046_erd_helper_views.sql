-- =====================================================
-- ERD HELPER VIEWS AND FUNCTIONS (deferred)
-- =====================================================
-- These views depend on tables created later (e.g. location_mentions in
-- 20250223000089_locations.sql, event_mentions in 20250223000080_events.sql).
-- Creating them here fails on fresh Supabase Preview replays.
--
-- Actual view definitions are applied in
-- 20260731130000_erd_helper_views.sql once dependencies exist.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'location_mentions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_mentions'
  ) THEN
    RAISE NOTICE 'erd_helper_views: dependencies present; views applied by later migration 20260731130000';
  ELSE
    RAISE NOTICE 'erd_helper_views: skipping early apply (dependencies not ready)';
  END IF;
END $$;
