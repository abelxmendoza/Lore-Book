-- Reflection Engine V1
-- Simple table for storing reflections extracted from journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reflections Table
CREATE TABLE IF NOT EXISTS public.reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('insight', 'realization', 'lesson', 'question', 'gratitude', 'growth')),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reflection Insights Table
CREATE TABLE IF NOT EXISTS public.reflection_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reflection_detected', 'pattern_in_reflections', 'growth_moment')),
  message TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  reflection_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reflections_user ON public.reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_reflections_entry ON public.reflections(entry_id);
CREATE INDEX IF NOT EXISTS idx_reflections_type ON public.reflections(user_id, type);
CREATE INDEX IF NOT EXISTS idx_reflections_timestamp ON public.reflections(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reflection_insights_user ON public.reflection_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_reflection_insights_type ON public.reflection_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_reflection_insights_timestamp ON public.reflection_insights(user_id, timestamp DESC);

-- RLS
ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reflection_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reflections"
  ON public.reflections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reflections"
  ON public.reflections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reflections"
  ON public.reflections
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reflections"
  ON public.reflections
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own reflection insights"
  ON public.reflection_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reflection insights"
  ON public.reflection_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

