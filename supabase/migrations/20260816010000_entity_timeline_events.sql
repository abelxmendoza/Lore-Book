-- Generalizes character_timeline_events (migrations/20250127_character_timeline_events.sql)
-- to organizations and locations, the two entity kinds that had no persisted
-- continuity builder — organizations recomputed a derived-context on every
-- request, locations did a client-side N+1 fetch of raw journal entries with
-- no role/impact classification at all. See entityTimelineBuilder.ts.
--
-- Characters keep their own dedicated table (no migration of existing data).
--
-- Two deliberate deviations from character_timeline_events' shape:
--   1. entity_type/entity_id polymorphic columns instead of a hard FK column
--      per entity kind — same pattern already used by entity_conversation_links.
--   2. event_id is nullable and a new source_thread_id column is added: a
--      timeline entry can be sourced from either a resolved_events row or a
--      conversation thread (via conversation_sessions.primary_entity_id, see
--      20260816000000_conversation_sessions_primary_entity.sql), so a thread's
--      own content can feed an entity's timeline directly instead of only
--      whatever got extracted into resolved_events.

CREATE TABLE public.entity_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  entity_type TEXT NOT NULL CHECK (entity_type IN ('organization', 'location')),
  entity_id UUID NOT NULL,

  event_id UUID REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  source_thread_id UUID REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
  CONSTRAINT entity_timeline_events_source_check CHECK (
    (event_id IS NOT NULL AND source_thread_id IS NULL) OR
    (event_id IS NULL AND source_thread_id IS NOT NULL)
  ),

  timeline_type TEXT NOT NULL CHECK (timeline_type IN (
    'shared_experience',    -- User and entity both present/involved
    'lore',                 -- Story about the entity (user wasn't there)
    'mentioned_in'          -- Entity mentioned but not directly involved
  )),

  user_was_present BOOLEAN NOT NULL,
  entity_role TEXT CHECK (entity_role IN (
    'participant', 'subject', 'mentioned', 'affected', 'organizer', 'observer', -- organizations
    'visited', 'referenced'                                                    -- locations
  )),

  event_title TEXT,
  event_date TIMESTAMPTZ,
  event_summary TEXT,
  event_type TEXT,

  source_entry_ids UUID[],
  source_message_ids UUID[],

  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, entity_type, entity_id, event_id, timeline_type),
  UNIQUE(user_id, entity_type, entity_id, source_thread_id, timeline_type)
);

CREATE INDEX idx_entity_timeline_events_user ON public.entity_timeline_events(user_id);
CREATE INDEX idx_entity_timeline_events_entity ON public.entity_timeline_events(entity_type, entity_id);
CREATE INDEX idx_entity_timeline_events_event ON public.entity_timeline_events(event_id);
CREATE INDEX idx_entity_timeline_events_thread ON public.entity_timeline_events(source_thread_id);
CREATE INDEX idx_entity_timeline_events_type ON public.entity_timeline_events(timeline_type);
CREATE INDEX idx_entity_timeline_events_date ON public.entity_timeline_events(event_date);
CREATE INDEX idx_entity_timeline_events_user_entity ON public.entity_timeline_events(user_id, entity_type, entity_id);

ALTER TABLE public.entity_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity timeline events"
  ON public.entity_timeline_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity timeline events"
  ON public.entity_timeline_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity timeline events"
  ON public.entity_timeline_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own entity timeline events"
  ON public.entity_timeline_events FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.entity_timeline_events IS 'Tracks shared experiences and lore for organizations and locations — the org/location equivalent of character_timeline_events.';
COMMENT ON COLUMN public.entity_timeline_events.timeline_type IS 'shared_experience: user and entity both present/involved, lore: story about the entity user wasnt there, mentioned_in: entity mentioned but not involved';
COMMENT ON COLUMN public.entity_timeline_events.entity_role IS 'Role of the entity in the event/thread: participant/subject/mentioned/affected/organizer/observer for organizations, visited/referenced for locations';
COMMENT ON COLUMN public.entity_timeline_events.source_thread_id IS 'Set instead of event_id when this entry is sourced from a conversation thread whose primary_entity_id matched this entity, rather than from resolved_events.';
