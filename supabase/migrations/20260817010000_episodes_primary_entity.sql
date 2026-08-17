-- Phase 6: per-episode primary-entity tracking.
-- Mirrors conversation_sessions.primary_entity_type/id (Phase 1) but scoped to
-- one episode (a segmented scene within a thread) rather than the whole thread,
-- so a thread covering two unrelated stories can attribute each episode to the
-- right character/location instead of blending both into one thread-level tag.
-- Organizations are intentionally excluded: episode segmentation tracks
-- per-message entity/location ids but has no organization-mention tracking.

ALTER TABLE public.episodes
  ADD COLUMN primary_entity_type text CHECK (primary_entity_type IN ('character', 'location')),
  ADD COLUMN primary_entity_id uuid;

CREATE INDEX episodes_primary_entity_idx
  ON public.episodes (user_id, primary_entity_type, primary_entity_id);
