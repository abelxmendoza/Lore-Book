-- Habit Formation Engine Schema
-- Stores habits, streaks, and habit insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habits Table
-- Stores all extracted and tracked habits
CREATE TABLE IF NOT EXISTS public.habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  trigger TEXT,
  reward TEXT,
  frequency FLOAT, -- Times per week
  last_performed TIMESTAMPTZ,
  streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  decay_risk FLOAT CHECK (decay_risk >= 0 AND decay_risk <= 1),
  cluster_id TEXT,
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habit Insights Table
-- Stores insights and recommendations about habits
CREATE TABLE IF NOT EXISTS public.habit_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'habit_detected', 'streak_update', 'habit_loop',
    'decay_warning', 'cluster_assignment', 'consistency_prediction'
  )),
  message TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  habit_id UUID REFERENCES public.habits(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_habits_user ON public.habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_last_performed ON public.habits(user_id, last_performed DESC);
CREATE INDEX IF NOT EXISTS idx_habits_category ON public.habits(user_id, category);
CREATE INDEX IF NOT EXISTS idx_habits_cluster ON public.habits(user_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_habit_insights_user_habit ON public.habit_insights(user_id, habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_insights_user_type ON public.habit_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_habit_insights_timestamp ON public.habit_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own habits
CREATE POLICY "Users can view own habits"
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own habits (via service)
CREATE POLICY "Users can insert own habits"
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own habits
CREATE POLICY "Users can update own habits"
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own habits
CREATE POLICY "Users can delete own habits"
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own habit insights
CREATE POLICY "Users can view own habit insights"
  ON public.habit_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own habit insights (via service)
CREATE POLICY "Users can insert own habit insights"
  ON public.habit_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own habit insights
CREATE POLICY "Users can update own habit insights"
  ON public.habit_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own habit insights
CREATE POLICY "Users can delete own habit insights"
  ON public.habit_insights
  FOR DELETE
  USING (auth.uid() = user_id);


