-- Recommendation Engine Schema
-- Stores proactive recommendations for journal prompts, reflection questions, actions, etc.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Recommendations Table
-- Stores all generated recommendations
CREATE TABLE IF NOT EXISTS public.recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'journal_prompt', 'reflection_question', 'action', 
    'relationship_checkin', 'goal_reminder', 'pattern_exploration',
    'gap_filler', 'continuity_followup', 'growth_opportunity', 
    'legacy_building'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  priority INT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source_engine TEXT,
  source_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shown', 'dismissed', 'acted_upon')),
  action_taken_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_recommendations_user_status ON public.recommendations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_type ON public.recommendations(user_id, type);
CREATE INDEX IF NOT EXISTS idx_recommendations_expires ON public.recommendations(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON public.recommendations(user_id, priority DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_recommendations_user_created ON public.recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_source_engine ON public.recommendations(user_id, source_engine) WHERE status = 'pending';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY recommendations_owner_select ON public.recommendations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recommendations_owner_insert ON public.recommendations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recommendations_owner_update ON public.recommendations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY recommendations_owner_delete ON public.recommendations
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recommendations_updated_at
  BEFORE UPDATE ON public.recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_recommendations_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.recommendations IS 'Stores proactive recommendations for journal prompts, reflection questions, actions, and engagement opportunities';
COMMENT ON COLUMN public.recommendations.type IS 'Type of recommendation: journal_prompt, reflection_question, action, relationship_checkin, goal_reminder, pattern_exploration, gap_filler, continuity_followup, growth_opportunity, legacy_building';
COMMENT ON COLUMN public.recommendations.status IS 'User interaction status: pending, shown, dismissed, acted_upon';
COMMENT ON COLUMN public.recommendations.source_engine IS 'Which engine generated this recommendation: continuity, chronology, identity_pulse, relationship_analytics, etc.';
COMMENT ON COLUMN public.recommendations.context IS 'Contextual information about the recommendation (pattern, entity, timeframe, etc.)';
COMMENT ON COLUMN public.recommendations.source_data IS 'Reference to source data (event_id, pattern_id, relationship_id, etc.)';

