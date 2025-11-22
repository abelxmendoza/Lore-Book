-- Decision Support Engine Schema
-- Stores decisions, outcomes, and decision insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Decisions Table
-- Stores all extracted and tracked decisions
CREATE TABLE IF NOT EXISTS public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  category TEXT,
  outcome TEXT CHECK (outcome IN ('positive', 'negative', 'neutral', 'unknown')),
  risk_level FLOAT CHECK (risk_level >= 0 AND risk_level <= 1),
  similarity_matches TEXT[],
  predicted_consequences TEXT[],
  context TEXT,
  alternatives_considered TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decision Insights Table
-- Stores insights and recommendations about decisions
CREATE TABLE IF NOT EXISTS public.decision_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'decision_detected', 'pattern_detected', 'similar_decision',
    'risk_warning', 'consequence_prediction', 'recommendation'
  )),
  message TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision_id UUID REFERENCES public.decisions(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_decisions_user ON public.decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_user_timestamp ON public.decisions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_category ON public.decisions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON public.decisions(user_id, outcome);
CREATE INDEX IF NOT EXISTS idx_decisions_risk ON public.decisions(user_id, risk_level DESC) WHERE risk_level >= 0.7;
CREATE INDEX IF NOT EXISTS idx_decision_insights_user_decision ON public.decision_insights(user_id, decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_insights_user_type ON public.decision_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_decision_insights_timestamp ON public.decision_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own decisions
CREATE POLICY "Users can view own decisions"
  ON public.decisions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own decisions (via service)
CREATE POLICY "Users can insert own decisions"
  ON public.decisions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own decisions
CREATE POLICY "Users can update own decisions"
  ON public.decisions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own decisions
CREATE POLICY "Users can delete own decisions"
  ON public.decisions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own decision insights
CREATE POLICY "Users can view own decision insights"
  ON public.decision_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own decision insights (via service)
CREATE POLICY "Users can insert own decision insights"
  ON public.decision_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own decision insights
CREATE POLICY "Users can update own decision insights"
  ON public.decision_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own decision insights
CREATE POLICY "Users can delete own decision insights"
  ON public.decision_insights
  FOR DELETE
  USING (auth.uid() = user_id);

