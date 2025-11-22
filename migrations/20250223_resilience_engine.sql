-- Resilience Engine Schema
-- Stores setbacks, recovery events, and resilience insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Setbacks Table
-- Stores all detected setbacks
CREATE TABLE IF NOT EXISTS public.setbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recovery Events Table
-- Tracks recovery from setbacks
CREATE TABLE IF NOT EXISTS public.recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setback_id UUID NOT NULL REFERENCES public.setbacks(id) ON DELETE CASCADE,
  recovery_start TIMESTAMPTZ NOT NULL,
  recovery_end TIMESTAMPTZ,
  emotional_trajectory FLOAT[],
  behavioral_changes TEXT[],
  recovery_duration_days INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resilience Insights Table
-- Stores insights and recommendations about resilience
CREATE TABLE IF NOT EXISTS public.resilience_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'setback_detected', 'recovery_started', 'recovery_completed',
    'emotional_recovery', 'behavioral_recovery', 'growth_from_adversity',
    'resilience_score'
  )),
  message TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_setback_id UUID REFERENCES public.setbacks(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_setbacks_user ON public.setbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_setbacks_user_timestamp ON public.setbacks(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_setbacks_severity ON public.setbacks(user_id, severity);
CREATE INDEX IF NOT EXISTS idx_recovery_events_setback ON public.recovery_events(setback_id);
CREATE INDEX IF NOT EXISTS idx_recovery_events_user ON public.recovery_events(user_id);
CREATE INDEX IF NOT EXISTS idx_resilience_insights_user_setback ON public.resilience_insights(user_id, related_setback_id);
CREATE INDEX IF NOT EXISTS idx_resilience_insights_user_type ON public.resilience_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_resilience_insights_timestamp ON public.resilience_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.setbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resilience_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own setbacks
CREATE POLICY "Users can view own setbacks"
  ON public.setbacks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own setbacks (via service)
CREATE POLICY "Users can insert own setbacks"
  ON public.setbacks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own setbacks
CREATE POLICY "Users can update own setbacks"
  ON public.setbacks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own setbacks
CREATE POLICY "Users can delete own setbacks"
  ON public.setbacks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own recovery events
CREATE POLICY "Users can view own recovery events"
  ON public.recovery_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own recovery events (via service)
CREATE POLICY "Users can insert own recovery events"
  ON public.recovery_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own recovery events
CREATE POLICY "Users can update own recovery events"
  ON public.recovery_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own recovery events
CREATE POLICY "Users can delete own recovery events"
  ON public.recovery_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own resilience insights
CREATE POLICY "Users can view own resilience insights"
  ON public.resilience_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own resilience insights (via service)
CREATE POLICY "Users can insert own resilience insights"
  ON public.resilience_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own resilience insights
CREATE POLICY "Users can update own resilience insights"
  ON public.resilience_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own resilience insights
CREATE POLICY "Users can delete own resilience insights"
  ON public.resilience_insights
  FOR DELETE
  USING (auth.uid() = user_id);

