-- Emotional Intelligence Engine V1
-- Understands emotional processing, triggers, behaviors, and patterns

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Emotional Events Table
CREATE TABLE IF NOT EXISTS public.emotional_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL CHECK (emotion IN (
    'anger', 'fear', 'sadness', 'shame', 'guilt',
    'joy', 'pride', 'love', 'disgust', 'surprise', 'anxiety'
  )),
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 10),
  trigger TEXT,
  context JSONB DEFAULT '{}',
  behavior_response TEXT,
  regulation_strategy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emotional Patterns Table
CREATE TABLE IF NOT EXISTS public.emotional_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dominant_emotions TEXT[] DEFAULT '{}',
  recurring_triggers TEXT[] DEFAULT '{}',
  reaction_loops JSONB DEFAULT '{}',
  recovery_speed FLOAT,
  volatility_score FLOAT CHECK (volatility_score >= 0 AND volatility_score <= 1),
  emotional_biases JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emotional_events_user_time ON public.emotional_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emotional_events_entry ON public.emotional_events(entry_id);
CREATE INDEX IF NOT EXISTS idx_emotional_events_emotion ON public.emotional_events(user_id, emotion);
CREATE INDEX IF NOT EXISTS idx_emotional_patterns_user ON public.emotional_patterns(user_id);

-- GIN indexes for arrays and JSONB
CREATE INDEX IF NOT EXISTS idx_emotional_events_context_gin ON public.emotional_events USING GIN(context);
CREATE INDEX IF NOT EXISTS idx_emotional_patterns_emotions_gin ON public.emotional_patterns USING GIN(dominant_emotions);
CREATE INDEX IF NOT EXISTS idx_emotional_patterns_triggers_gin ON public.emotional_patterns USING GIN(recurring_triggers);
CREATE INDEX IF NOT EXISTS idx_emotional_patterns_loops_gin ON public.emotional_patterns USING GIN(reaction_loops);
CREATE INDEX IF NOT EXISTS idx_emotional_patterns_biases_gin ON public.emotional_patterns USING GIN(emotional_biases);

-- RLS
ALTER TABLE public.emotional_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emotional events"
  ON public.emotional_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emotional events"
  ON public.emotional_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emotional events"
  ON public.emotional_events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own emotional events"
  ON public.emotional_events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own emotional patterns"
  ON public.emotional_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emotional patterns"
  ON public.emotional_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emotional patterns"
  ON public.emotional_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own emotional patterns"
  ON public.emotional_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

