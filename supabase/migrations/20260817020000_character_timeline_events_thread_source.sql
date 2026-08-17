-- Phase 6: allow character_timeline_events rows to be sourced from a segmented
-- episode (not just a resolved_events row), so a character can accumulate
-- lore/shared-experience entries directly from the episodes where they were
-- the primary entity — mirroring entity_timeline_events' event_id/
-- source_thread_id deviation (Phase 2), but keyed to the episode itself
-- rather than the whole thread: a single thread can contain several episodes
-- whose primary_entity_id points at the same character (e.g. the character
-- reappears in a later scene), and each of those episodes needs its own row
-- rather than colliding into one on upsert.

ALTER TABLE public.character_timeline_events
  ALTER COLUMN event_id DROP NOT NULL,
  ADD COLUMN source_episode_id uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  ADD CONSTRAINT character_timeline_events_source_check CHECK (
    (event_id IS NOT NULL AND source_episode_id IS NULL) OR
    (event_id IS NULL AND source_episode_id IS NOT NULL)
  ),
  ADD CONSTRAINT character_timeline_events_user_character_episode_type_key
    UNIQUE (user_id, character_id, source_episode_id, timeline_type);

CREATE INDEX idx_character_timeline_events_episode ON public.character_timeline_events(source_episode_id);
