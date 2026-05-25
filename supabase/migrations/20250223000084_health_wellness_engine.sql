-- Health & Wellness Engine Schema
-- Stores symptoms, sleep, energy, cycles, and wellness scores

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Symptom Events Table
-- Stores symptom events from journal entries
CREATE TABLE IF NOT EXISTS public.symptom_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'fatigue', 'headache', 'tightness', 'soreness', 'pain', 'injury',
    'stress_somatic', 'sleep_issue', 'digestion', 'immune', 'unknown'
  )),
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  evidence TEXT NOT NULL,
  weight FLOAT NOT NULL CHECK (weight >= 0 AND weight <= 1),
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sleep Events Table
-- Stores sleep events
CREATE TABLE IF NOT EXISTS public.sleep_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  hours FLOAT,
  quality FLOAT CHECK (quality >= 0 AND quality <= 1),
  evidence TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Energy Events Table
-- Stores energy level events
CREATE TABLE IF NOT EXISTS public.energy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level FLOAT NOT NULL CHECK (level >= 0 AND level <= 1),
  evidence TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wellness Scores Table
-- Stores wellness scores over time
CREATE TABLE IF NOT EXISTS public.wellness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  physical FLOAT NOT NULL CHECK (physical >= 0 AND physical <= 1),
  mental FLOAT NOT NULL CHECK (mental >= 0 AND mental <= 1),
  sleep FLOAT NOT NULL CHECK (sleep >= 0 AND sleep <= 1),
  recovery FLOAT NOT NULL CHECK (recovery >= 0 AND recovery <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health Insights Table
-- Stores insights about health and wellness
CREATE TABLE IF NOT EXISTS public.health_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'symptom_detected', 'sleep_issue', 'low_energy', 'stress_correlation',
    'cycle_detected', 'recovery_needed', 'wellness_improvement', 'wellness_decline'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_symptom_events_user_type ON public.symptom_events(user_id, type);
CREATE INDEX IF NOT EXISTS idx_symptom_events_timestamp ON public.symptom_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_events_user_timestamp ON public.sleep_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_energy_events_user_timestamp ON public.energy_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_scores_user_timestamp ON public.wellness_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_insights_user_type ON public.health_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_health_insights_timestamp ON public.health_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.symptom_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sleep_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own symptom events
CREATE POLICY "Users can view own symptom events"
  ON public.symptom_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own symptom events (via service)
CREATE POLICY "Users can insert own symptom events"
  ON public.symptom_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own symptom events
CREATE POLICY "Users can update own symptom events"
  ON public.symptom_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own symptom events
CREATE POLICY "Users can delete own symptom events"
  ON public.symptom_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own sleep events
CREATE POLICY "Users can view own sleep events"
  ON public.sleep_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own sleep events (via service)
CREATE POLICY "Users can insert own sleep events"
  ON public.sleep_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sleep events
CREATE POLICY "Users can update own sleep events"
  ON public.sleep_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own sleep events
CREATE POLICY "Users can delete own sleep events"
  ON public.sleep_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own energy events
CREATE POLICY "Users can view own energy events"
  ON public.energy_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own energy events (via service)
CREATE POLICY "Users can insert own energy events"
  ON public.energy_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own energy events
CREATE POLICY "Users can update own energy events"
  ON public.energy_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own energy events
CREATE POLICY "Users can delete own energy events"
  ON public.energy_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own wellness scores
CREATE POLICY "Users can view own wellness scores"
  ON public.wellness_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own wellness scores (via service)
CREATE POLICY "Users can insert own wellness scores"
  ON public.wellness_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own wellness scores
CREATE POLICY "Users can update own wellness scores"
  ON public.wellness_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own wellness scores
CREATE POLICY "Users can delete own wellness scores"
  ON public.wellness_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own health insights
CREATE POLICY "Users can view own health insights"
  ON public.health_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own health insights (via service)
CREATE POLICY "Users can insert own health insights"
  ON public.health_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own health insights
CREATE POLICY "Users can update own health insights"
  ON public.health_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own health insights
CREATE POLICY "Users can delete own health insights"
  ON public.health_insights
  FOR DELETE
  USING (auth.uid() = user_id);

