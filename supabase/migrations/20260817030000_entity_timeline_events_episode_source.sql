-- Phase 6: add an episode-sourced path for entity_timeline_events, used by
-- the location kind only (organizations keep the existing thread-level
-- source_thread_id path — no per-episode organization data exists).
--
-- A new column rather than reusing source_thread_id: a single thread can
-- contain multiple episodes whose primary_entity_id points at the same
-- location (the location comes up again in a later scene), and the existing
-- UNIQUE(..., source_thread_id, timeline_type) would collapse those distinct
-- episodes into one row on upsert. Keying on the episode itself avoids that.

ALTER TABLE public.entity_timeline_events
  ADD COLUMN source_episode_id UUID REFERENCES public.episodes(id) ON DELETE CASCADE;

ALTER TABLE public.entity_timeline_events
  DROP CONSTRAINT entity_timeline_events_source_check,
  ADD CONSTRAINT entity_timeline_events_source_check CHECK (
    (event_id IS NOT NULL AND source_thread_id IS NULL AND source_episode_id IS NULL) OR
    (event_id IS NULL AND source_thread_id IS NOT NULL AND source_episode_id IS NULL) OR
    (event_id IS NULL AND source_thread_id IS NULL AND source_episode_id IS NOT NULL)
  );

ALTER TABLE public.entity_timeline_events
  ADD CONSTRAINT entity_timeline_events_entity_episode_type_key
    UNIQUE (user_id, entity_type, entity_id, source_episode_id, timeline_type);

CREATE INDEX idx_entity_timeline_events_episode ON public.entity_timeline_events(source_episode_id);

COMMENT ON COLUMN public.entity_timeline_events.source_episode_id IS 'Set instead of event_id/source_thread_id when this entry is sourced from a segmented episode whose primary_entity_id matched this entity (location kind only).';
