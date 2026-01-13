-- Event Impacts Table
-- Tracks how events affect the user even if they're not a direct participant

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  
  -- Impact classification
  impact_type TEXT NOT NULL CHECK (impact_type IN (
    'direct_participant',      -- User is directly in the event
    'indirect_affected',        -- User is affected but not present
    'related_person_affected', -- Someone close to user is in the event
    'observer',                -- User talks about it but not affected
    'ripple_effect'            -- Event creates consequences for user
  )),
  
  -- Who connects the user to this event
  connection_character_id UUID REFERENCES public.characters(id), -- Person who links user to event
  connection_type TEXT, -- 'family', 'friend', 'colleague', etc.
  
  -- Impact details
  emotional_impact TEXT CHECK (emotional_impact IN ('positive', 'negative', 'neutral', 'mixed')),
  impact_intensity FLOAT DEFAULT 0.5 CHECK (impact_intensity >= 0 AND impact_intensity <= 1),
  impact_description TEXT, -- How/why this affects the user
  
  -- Evidence
  source_message_ids UUID[], -- Chat messages that mention this impact
  source_journal_entry_ids UUID[], -- Journal entries about this impact
  
  -- Confidence
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, event_id, impact_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_impacts_user ON public.event_impacts(user_id);
CREATE INDEX IF NOT EXISTS idx_event_impacts_event ON public.event_impacts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_impacts_type ON public.event_impacts(impact_type);
CREATE INDEX IF NOT EXISTS idx_event_impacts_connection ON public.event_impacts(connection_character_id);
CREATE INDEX IF NOT EXISTS idx_event_impacts_user_type ON public.event_impacts(user_id, impact_type);

-- RLS
ALTER TABLE public.event_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event impacts"
  ON public.event_impacts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own event impacts"
  ON public.event_impacts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own event impacts"
  ON public.event_impacts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own event impacts"
  ON public.event_impacts FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.event_impacts IS 'Tracks how events affect the user even if they are not direct participants';
COMMENT ON COLUMN public.event_impacts.impact_type IS 'Type of impact: direct_participant, indirect_affected, related_person_affected, observer, ripple_effect';
COMMENT ON COLUMN public.event_impacts.connection_character_id IS 'Character who connects the user to this event (for related_person_affected type)';
COMMENT ON COLUMN public.event_impacts.impact_intensity IS 'How strongly this event affects the user (0.0-1.0)';
