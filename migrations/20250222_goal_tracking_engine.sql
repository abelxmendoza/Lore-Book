-- Enhanced Goal Tracking Engine Schema
-- Stores goals, milestones, and goal insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Goals Table
-- Stores all extracted and tracked goals
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_action_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'abandoned', 'completed')),
  milestones JSONB DEFAULT '[]'::jsonb,
  probability FLOAT CHECK (probability >= 0 AND probability <= 1),
  dependencies UUID[] DEFAULT '{}',
  source TEXT CHECK (source IN ('entry', 'task', 'arc', 'manual')),
  source_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Goal Insights Table
-- Stores insights and recommendations about goals
CREATE TABLE IF NOT EXISTS public.goal_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'progress', 'stagnation', 'dependency_warning',
    'milestone', 'success_probability', 'goal_state_change'
  )),
  message TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_updated ON public.goals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_source ON public.goals(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_goal_insights_user_goal ON public.goal_insights(user_id, related_goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_insights_user_type ON public.goal_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_goal_insights_timestamp ON public.goal_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own goals
CREATE POLICY "Users can view own goals"
  ON public.goals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own goals (via service)
CREATE POLICY "Users can insert own goals"
  ON public.goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own goals
CREATE POLICY "Users can update own goals"
  ON public.goals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own goals
CREATE POLICY "Users can delete own goals"
  ON public.goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own goal insights
CREATE POLICY "Users can view own goal insights"
  ON public.goal_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own goal insights (via service)
CREATE POLICY "Users can insert own goal insights"
  ON public.goal_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own goal insights
CREATE POLICY "Users can update own goal insights"
  ON public.goal_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own goal insights
CREATE POLICY "Users can delete own goal insights"
  ON public.goal_insights
  FOR DELETE
  USING (auth.uid() = user_id);

