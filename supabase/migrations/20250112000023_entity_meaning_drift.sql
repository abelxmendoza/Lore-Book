-- =====================================================
-- ENTITY MEANING DRIFT ENGINE
-- Purpose: Track how entity meaning, context, and role
-- evolve over time. Not judgment, pure observation.
-- =====================================================

-- Entity Meaning Snapshots
-- Captures the dominant meaning/context of an entity during a time period
CREATE TABLE IF NOT EXISTS public.entity_meaning_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL, -- References entities, characters, locations, etc.
  entity_type TEXT NOT NULL CHECK (entity_type IN ('CHARACTER', 'LOCATION', 'ORG', 'PERSON', 'ENTITY')),
  timeframe_start TIMESTAMPTZ NOT NULL,
  timeframe_end TIMESTAMPTZ, -- NULL means current/ongoing
  dominant_context TEXT, -- e.g. "Work", "Family", "Romantic", "Social", "Personal", "Professional"
  sentiment_mode TEXT CHECK (sentiment_mode IN ('POSITIVE', 'MIXED', 'NEGATIVE', 'NEUTRAL')),
  importance_level TEXT, -- e.g. "High", "Moderate", "Low", "Background"
  mention_frequency NUMERIC, -- mentions per month during this period
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  signals JSONB DEFAULT '{}'::jsonb, -- why this snapshot exists: context_mentions, sentiment_scores, etc.
  user_note TEXT, -- optional user annotation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity Meaning Transitions
-- Tracks when and how meaning changed between snapshots
CREATE TABLE IF NOT EXISTS public.entity_meaning_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  from_snapshot_id UUID REFERENCES entity_meaning_snapshots(id) ON DELETE SET NULL,
  to_snapshot_id UUID REFERENCES entity_meaning_snapshots(id) ON DELETE SET NULL,
  transition_type TEXT NOT NULL CHECK (transition_type IN (
    'ROLE_SHIFT',      -- e.g. work → personal
    'SENTIMENT_SHIFT', -- e.g. positive → mixed
    'IMPORTANCE_SHIFT', -- e.g. high → low
    'CONTEXT_SHIFT',   -- e.g. family → social
    'MULTIPLE_SHIFTS'  -- multiple dimensions changed
  )),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_confirmed_at TIMESTAMPTZ,
  note TEXT, -- user explanation or system note
  confidence FLOAT DEFAULT 0.6 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meaning_snapshots_entity ON public.entity_meaning_snapshots(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_meaning_snapshots_user ON public.entity_meaning_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_meaning_snapshots_timeframe ON public.entity_meaning_snapshots(timeframe_start, timeframe_end);
CREATE INDEX IF NOT EXISTS idx_meaning_transitions_entity ON public.entity_meaning_transitions(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_meaning_transitions_user ON public.entity_meaning_transitions(user_id);
CREATE INDEX IF NOT EXISTS idx_meaning_transitions_confirmed ON public.entity_meaning_transitions(user_confirmed, detected_at);

-- RLS Policies
ALTER TABLE public.entity_meaning_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_meaning_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meaning snapshots"
  ON public.entity_meaning_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meaning snapshots"
  ON public.entity_meaning_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meaning snapshots"
  ON public.entity_meaning_snapshots
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own meaning transitions"
  ON public.entity_meaning_transitions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meaning transitions"
  ON public.entity_meaning_transitions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meaning transitions"
  ON public.entity_meaning_transitions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_entity_meaning_snapshot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_entity_meaning_snapshots_updated_at
  BEFORE UPDATE ON public.entity_meaning_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_meaning_snapshot_updated_at();

