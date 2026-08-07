-- Personality Engine V1
-- Simple table for storing personality traits extracted from journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Personality Traits Table
CREATE TABLE IF NOT EXISTS public.personality_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trait TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  frequency INT DEFAULT 1,
  first_detected TIMESTAMPTZ,
  last_detected TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trait)
);

-- Personality Insights Table
CREATE TABLE IF NOT EXISTS public.personality_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('trait_detected', 'trait_evolution', 'personality_shift', 'dominant_trait')),
  message TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  trait TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_personality_traits_user ON public.personality_traits(user_id);
CREATE INDEX IF NOT EXISTS idx_personality_traits_trait ON public.personality_traits(user_id, trait);
CREATE INDEX IF NOT EXISTS idx_personality_traits_frequency ON public.personality_traits(user_id, frequency DESC);

CREATE INDEX IF NOT EXISTS idx_personality_insights_user ON public.personality_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_personality_insights_type ON public.personality_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_personality_insights_timestamp ON public.personality_insights(user_id, timestamp DESC);

-- RLS
ALTER TABLE public.personality_traits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personality_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personality traits"
  ON public.personality_traits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own personality traits"
  ON public.personality_traits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personality traits"
  ON public.personality_traits
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personality traits"
  ON public.personality_traits
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own personality insights"
  ON public.personality_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own personality insights"
  ON public.personality_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

