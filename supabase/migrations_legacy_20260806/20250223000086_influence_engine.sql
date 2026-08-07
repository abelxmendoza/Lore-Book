-- Influence Engine Schema
-- Stores person influence profiles, events, and insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Person Influence Profiles Table
-- Stores influence analysis for each person
CREATE TABLE IF NOT EXISTS public.person_influence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  emotional_impact FLOAT NOT NULL CHECK (emotional_impact >= -1 AND emotional_impact <= 1),
  behavioral_impact FLOAT NOT NULL CHECK (behavioral_impact >= -1 AND behavioral_impact <= 1),
  frequency FLOAT DEFAULT 0,
  toxicity_score FLOAT NOT NULL DEFAULT 0 CHECK (toxicity_score >= 0 AND toxicity_score <= 1),
  uplift_score FLOAT NOT NULL DEFAULT 0 CHECK (uplift_score >= 0 AND uplift_score <= 1),
  net_influence FLOAT NOT NULL CHECK (net_influence >= -1 AND net_influence <= 1),
  interaction_count INT DEFAULT 0,
  first_interaction TIMESTAMPTZ,
  last_interaction TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person)
);

-- Influence Events Table
-- Stores individual influence events/interactions
CREATE TABLE IF NOT EXISTS public.influence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  person TEXT NOT NULL,
  text TEXT NOT NULL,
  sentiment FLOAT NOT NULL CHECK (sentiment >= -1 AND sentiment <= 1),
  behavior_tags TEXT[] DEFAULT '{}',
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Influence Insights Table
-- Stores insights and recommendations about influence
CREATE TABLE IF NOT EXISTS public.influence_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'toxic_pattern', 'positive_influence', 'high_risk_person',
    'uplifting_person', 'dominant_influence', 'behavior_shift_detected',
    'relationship_power_shift', 'influence_score'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  person TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_person_influence_user ON public.person_influence(user_id);
CREATE INDEX IF NOT EXISTS idx_person_influence_net ON public.person_influence(user_id, net_influence DESC);
CREATE INDEX IF NOT EXISTS idx_person_influence_toxicity ON public.person_influence(user_id, toxicity_score DESC) WHERE toxicity_score >= 0.5;
CREATE INDEX IF NOT EXISTS idx_person_influence_uplift ON public.person_influence(user_id, uplift_score DESC) WHERE uplift_score >= 0.5;
CREATE INDEX IF NOT EXISTS idx_influence_events_user_person ON public.influence_events(user_id, person);
CREATE INDEX IF NOT EXISTS idx_influence_events_timestamp ON public.influence_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_influence_insights_user_person ON public.influence_insights(user_id, person);
CREATE INDEX IF NOT EXISTS idx_influence_insights_type ON public.influence_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_influence_insights_timestamp ON public.influence_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.person_influence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influence_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own person influence
CREATE POLICY "Users can view own person influence"
  ON public.person_influence
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own person influence (via service)
CREATE POLICY "Users can insert own person influence"
  ON public.person_influence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own person influence
CREATE POLICY "Users can update own person influence"
  ON public.person_influence
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own person influence
CREATE POLICY "Users can delete own person influence"
  ON public.person_influence
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own influence events
CREATE POLICY "Users can view own influence events"
  ON public.influence_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own influence events (via service)
CREATE POLICY "Users can insert own influence events"
  ON public.influence_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own influence events
CREATE POLICY "Users can update own influence events"
  ON public.influence_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own influence events
CREATE POLICY "Users can delete own influence events"
  ON public.influence_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own influence insights
CREATE POLICY "Users can view own influence insights"
  ON public.influence_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own influence insights (via service)
CREATE POLICY "Users can insert own influence insights"
  ON public.influence_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own influence insights
CREATE POLICY "Users can update own influence insights"
  ON public.influence_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own influence insights
CREATE POLICY "Users can delete own influence insights"
  ON public.influence_insights
  FOR DELETE
  USING (auth.uid() = user_id);

