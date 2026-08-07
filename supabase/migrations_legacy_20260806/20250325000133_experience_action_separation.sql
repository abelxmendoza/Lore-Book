-- Experience vs Action Separation
-- Separates macro Experiences (lived events) from micro Actions (atomic verb-forward moments)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Actions Table (Atomic Layer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core fields (timestamp is REQUIRED - actions must have timestamps)
  timestamp TIMESTAMPTZ NOT NULL,
  verb TEXT NOT NULL, -- "said", "walked", "felt", "decided", "noticed"
  target TEXT, -- Optional: who/what the action targeted
  content TEXT, -- What was said/done (for "said", "told", etc.)
  
  -- Optional attachment to Experience
  experience_id UUID REFERENCES event_records(id) ON DELETE SET NULL,
  
  -- Context
  emotion TEXT, -- Optional: emotion felt during action
  location_id UUID, -- Optional: where this happened
  participant_ids UUID[] DEFAULT '{}', -- Who was involved
  
  -- Source tracking
  source_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for actions
CREATE INDEX IF NOT EXISTS idx_actions_user ON public.actions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_actions_experience ON public.actions(experience_id);
CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON public.actions(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_actions_verb ON public.actions(user_id, verb);
CREATE INDEX IF NOT EXISTS idx_actions_participants ON public.actions USING GIN(participant_ids);

-- ============================================================================
-- Update event_records for "open" experiences
-- ============================================================================

-- Add is_open flag for "dumping the night" scenarios
ALTER TABLE public.event_records 
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Index for finding open experiences
CREATE INDEX IF NOT EXISTS idx_event_records_open ON public.event_records(user_id, is_open) WHERE is_open = true;

-- ============================================================================
-- RLS Policies for Actions
-- ============================================================================

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actions"
  ON public.actions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own actions"
  ON public.actions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions"
  ON public.actions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own actions"
  ON public.actions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.actions IS 'Atomic actions: verb-forward moments ("I said X", "I walked away", "I froze")';
COMMENT ON COLUMN public.actions.timestamp IS 'REQUIRED: Actions must have timestamps';
COMMENT ON COLUMN public.actions.experience_id IS 'Optional: Attach action to an open experience';
COMMENT ON COLUMN public.event_records.is_open IS 'True when experience is being actively dumped (allows actions to attach)';
COMMENT ON COLUMN public.event_records.closed_at IS 'When the experience was closed (no longer accepting actions)';
