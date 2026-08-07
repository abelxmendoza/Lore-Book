-- Growth Trajectory Engine Schema
-- Stores growth signals, trajectory points, and growth insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Growth Signals Table
-- Stores individual growth signals from journal entries
CREATE TABLE IF NOT EXISTS public.growth_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'fitness', 'career', 'relationships', 'mindset', 'discipline',
    'creativity', 'learning', 'health', 'financial', 'social', 'other'
  )),
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  direction INT NOT NULL CHECK (direction IN (-1, 1)),
  text TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Growth Trajectory Points Table
-- Stores cumulative growth trajectory points
CREATE TABLE IF NOT EXISTS public.growth_trajectory_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'fitness', 'career', 'relationships', 'mindset', 'discipline',
    'creativity', 'learning', 'health', 'financial', 'social', 'other'
  )),
  value FLOAT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Growth Insights Table
-- Stores insights and recommendations about growth
CREATE TABLE IF NOT EXISTS public.growth_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'level_up', 'plateau', 'breakthrough', 'regression',
    'growth_velocity_spike', 'identity_shift', 'domain_mastery', 'stagnation_zone'
  )),
  message TEXT NOT NULL,
  domain TEXT CHECK (domain IN (
    'fitness', 'career', 'relationships', 'mindset', 'discipline',
    'creativity', 'learning', 'health', 'financial', 'social', 'other'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_growth_signals_user_domain ON public.growth_signals(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_growth_signals_timestamp ON public.growth_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_growth_signals_direction ON public.growth_signals(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_growth_trajectory_user_domain ON public.growth_trajectory_points(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_growth_trajectory_timestamp ON public.growth_trajectory_points(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_growth_insights_user_domain ON public.growth_insights(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_growth_insights_type ON public.growth_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_growth_insights_timestamp ON public.growth_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.growth_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_trajectory_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own growth signals
CREATE POLICY "Users can view own growth signals"
  ON public.growth_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own growth signals (via service)
CREATE POLICY "Users can insert own growth signals"
  ON public.growth_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own growth signals
CREATE POLICY "Users can update own growth signals"
  ON public.growth_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own growth signals
CREATE POLICY "Users can delete own growth signals"
  ON public.growth_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own growth trajectory points
CREATE POLICY "Users can view own growth trajectory points"
  ON public.growth_trajectory_points
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own growth trajectory points (via service)
CREATE POLICY "Users can insert own growth trajectory points"
  ON public.growth_trajectory_points
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own growth trajectory points
CREATE POLICY "Users can update own growth trajectory points"
  ON public.growth_trajectory_points
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own growth trajectory points
CREATE POLICY "Users can delete own growth trajectory points"
  ON public.growth_trajectory_points
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own growth insights
CREATE POLICY "Users can view own growth insights"
  ON public.growth_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own growth insights (via service)
CREATE POLICY "Users can insert own growth insights"
  ON public.growth_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own growth insights
CREATE POLICY "Users can update own growth insights"
  ON public.growth_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own growth insights
CREATE POLICY "Users can delete own growth insights"
  ON public.growth_insights
  FOR DELETE
  USING (auth.uid() = user_id);

