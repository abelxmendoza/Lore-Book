-- Drop retired Character compatibility table.
-- Character chronology lives on resolved_events.people[] + CanonicalTemporalModel.
-- CASCADE removes this table's FKs, indexes, RLS policies, and grants only.
-- Does not touch resolved_events, characters, character_relationship_history,
-- entity_timeline_events (org/location), or journal data.
--
-- Production ledger (applied 2026-08-21):
--   supabase_migrations.schema_migrations
--     version = 20260821194550
--     name    = drop_character_timeline_events
-- Originally authored as 20260821140000; filename retimestamped so the repo
-- is an exact match, not a same-name/different-timestamp alias.

DROP TABLE IF EXISTS public.character_timeline_events CASCADE;
