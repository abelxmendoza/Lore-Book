-- Time Management Engine Schema
-- Stores time events, blocks, procrastination signals, energy curves, and time scores

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Time Events Table
-- Stores time events from journal entries
CREATE TABLE IF NOT EXISTS public.time_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  category TEXT NOT NULL CHECK (category IN (
    'work', 'coding', 'gym', 'bjj', 'muay_thai', 'robotics', 'learning',
    'family', 'social', 'travel', 'sleep', 'eating', 'rest', 'errands',
    'entertainment', 'unknown'
  )),
  description TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time Blocks Table
-- Stores grouped time blocks
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start TIMESTAMPTZ NOT NULL,
  end TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'work', 'coding', 'gym', 'bjj', 'muay_thai', 'robotics', 'learning',
    'family', 'social', 'travel', 'sleep', 'eating', 'rest', 'errands',
    'entertainment', 'unknown'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Procrastination Signals Table
-- Stores procrastination detections
CREATE TABLE IF NOT EXISTS public.procrastination_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'avoidance', 'delay', 'distraction', 'fatigue', 'low_priority',
    'perfectionism', 'overwhelm', 'other'
  )),
  evidence TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  category TEXT CHECK (category IN (
    'work', 'coding', 'gym', 'bjj', 'muay_thai', 'robotics', 'learning',
    'family', 'social', 'travel', 'sleep', 'eating', 'rest', 'errands',
    'entertainment', 'unknown'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Energy Curve Points Table
-- Stores energy curve data
CREATE TABLE IF NOT EXISTS public.energy_curve_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  level FLOAT NOT NULL CHECK (level >= 0 AND level <= 1),
  count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time Scores Table
-- Stores time management scores
CREATE TABLE IF NOT EXISTS public.time_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consistency FLOAT NOT NULL CHECK (consistency >= 0 AND consistency <= 1),
  efficiency FLOAT NOT NULL CHECK (efficiency >= 0 AND efficiency <= 1),
  distribution FLOAT NOT NULL CHECK (distribution >= 0 AND distribution <= 1),
  focus FLOAT NOT NULL CHECK (focus >= 0 AND focus <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time Insights Table
-- Stores time management insights
CREATE TABLE IF NOT EXISTS public.time_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'time_event_detected', 'procrastination_detected', 'energy_peak', 'energy_low',
    'time_block_detected', 'cycle_detected', 'efficiency_improvement',
    'efficiency_decline', 'focus_window', 'distraction_pattern'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  category TEXT CHECK (category IN (
    'work', 'coding', 'gym', 'bjj', 'muay_thai', 'robotics', 'learning',
    'family', 'social', 'travel', 'sleep', 'eating', 'rest', 'errands',
    'entertainment', 'unknown'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_time_events_user_category ON public.time_events(user_id, category);
CREATE INDEX IF NOT EXISTS idx_time_events_user_timestamp ON public.time_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_blocks_user_category ON public.time_blocks(user_id, category);
CREATE INDEX IF NOT EXISTS idx_time_blocks_user_start ON public.time_blocks(user_id, start DESC);
CREATE INDEX IF NOT EXISTS idx_procrastination_signals_user_type ON public.procrastination_signals(user_id, type);
CREATE INDEX IF NOT EXISTS idx_procrastination_signals_timestamp ON public.procrastination_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_energy_curve_user_hour ON public.energy_curve_points(user_id, hour);
CREATE INDEX IF NOT EXISTS idx_energy_curve_timestamp ON public.energy_curve_points(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_scores_user_timestamp ON public.time_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_insights_user_type ON public.time_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_time_insights_timestamp ON public.time_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.time_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procrastination_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_curve_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own time events
CREATE POLICY "Users can view own time events"
  ON public.time_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own time events (via service)
CREATE POLICY "Users can insert own time events"
  ON public.time_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own time events
CREATE POLICY "Users can update own time events"
  ON public.time_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own time events
CREATE POLICY "Users can delete own time events"
  ON public.time_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own time blocks
CREATE POLICY "Users can view own time blocks"
  ON public.time_blocks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own time blocks (via service)
CREATE POLICY "Users can insert own time blocks"
  ON public.time_blocks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own time blocks
CREATE POLICY "Users can update own time blocks"
  ON public.time_blocks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own time blocks
CREATE POLICY "Users can delete own time blocks"
  ON public.time_blocks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own procrastination signals
CREATE POLICY "Users can view own procrastination signals"
  ON public.procrastination_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own procrastination signals (via service)
CREATE POLICY "Users can insert own procrastination signals"
  ON public.procrastination_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own procrastination signals
CREATE POLICY "Users can update own procrastination signals"
  ON public.procrastination_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own procrastination signals
CREATE POLICY "Users can delete own procrastination signals"
  ON public.procrastination_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own energy curve points
CREATE POLICY "Users can view own energy curve points"
  ON public.energy_curve_points
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own energy curve points (via service)
CREATE POLICY "Users can insert own energy curve points"
  ON public.energy_curve_points
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own energy curve points
CREATE POLICY "Users can update own energy curve points"
  ON public.energy_curve_points
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own energy curve points
CREATE POLICY "Users can delete own energy curve points"
  ON public.energy_curve_points
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own time scores
CREATE POLICY "Users can view own time scores"
  ON public.time_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own time scores (via service)
CREATE POLICY "Users can insert own time scores"
  ON public.time_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own time scores
CREATE POLICY "Users can update own time scores"
  ON public.time_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own time scores
CREATE POLICY "Users can delete own time scores"
  ON public.time_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own time insights
CREATE POLICY "Users can view own time insights"
  ON public.time_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own time insights (via service)
CREATE POLICY "Users can insert own time insights"
  ON public.time_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own time insights
CREATE POLICY "Users can update own time insights"
  ON public.time_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own time insights
CREATE POLICY "Users can delete own time insights"
  ON public.time_insights
  FOR DELETE
  USING (auth.uid() = user_id);

