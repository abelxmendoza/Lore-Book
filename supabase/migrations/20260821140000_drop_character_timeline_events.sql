-- Drop retired Character compatibility table.
-- Character chronology lives on resolved_events.people[] + CanonicalTemporalModel.
-- CASCADE removes this table's FKs, indexes, RLS policies, and grants only.
-- Does not touch resolved_events, characters, character_relationship_history,
-- entity_timeline_events (org/location), or journal data.

DROP TABLE IF EXISTS public.character_timeline_events CASCADE;
