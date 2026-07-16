-- =====================================================
-- CHARACTER TIMELINE EVENTS
-- Purpose: Track shared experiences and lore for each character
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Character Timeline Events Table
CREATE TABLE IF NOT EXISTS public.character_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  
  -- Timeline Type
  timeline_type TEXT NOT NULL CHECK (timeline_type IN (
    'shared_experience',    -- User and character both present
    'lore',                 -- Story about character (user wasn't there)
    'mentioned_in'          -- Character mentioned but not directly involved
  )),
  
  -- Context
  user_was_present BOOLEAN NOT NULL,
  character_role TEXT CHECK (character_role IN ('participant', 'subject', 'mentioned', 'affected', 'organizer', 'observer')),
  relationship_context TEXT, -- How this relates to user-character relationship
  
  -- Event Details (denormalized for quick access)
  event_title TEXT,
  event_date TIMESTAMPTZ,
  event_summary TEXT,
  event_type TEXT,
  
  -- Impact Context
  impact_type TEXT, -- From event_impacts
  connection_character_id UUID REFERENCES public.characters(id),
  emotional_impact TEXT CHECK (emotional_impact IN ('positive', 'negative', 'neutral', 'mixed')),
  
  -- Evidence
  source_entry_ids UUID[],
  source_message_ids UUID[],
  
  -- Metadata
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, character_id, event_id, timeline_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_user ON public.character_timeline_events(user_id);
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_character ON public.character_timeline_events(character_id);
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_event ON public.character_timeline_events(event_id);
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_type ON public.character_timeline_events(timeline_type);
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_date ON public.character_timeline_events(event_date);
CREATE INDEX IF NOT EXISTS idx_character_timeline_events_user_character ON public.character_timeline_events(user_id, character_id);

-- RLS
ALTER TABLE public.character_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own character timeline events"
  ON public.character_timeline_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own character timeline events"
  ON public.character_timeline_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own character timeline events"
  ON public.character_timeline_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own character timeline events"
  ON public.character_timeline_events FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.character_timeline_events IS 'Tracks shared experiences and lore for each character relationship';
COMMENT ON COLUMN public.character_timeline_events.timeline_type IS 'shared_experience: user and character both present, lore: story about character user wasnt there, mentioned_in: character mentioned but not involved';
COMMENT ON COLUMN public.character_timeline_events.character_role IS 'Role of character in the event: participant, subject, mentioned, affected, organizer, observer';
