-- Emotional Intelligence Engine Schema
-- Stores emotion signals, triggers, reactions, and regulation scores

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Emotion Signals Table
-- Stores individual emotion signals from journal entries
CREATE TABLE IF NOT EXISTS public.emotion_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  emotion TEXT NOT NULL CHECK (emotion IN (
    'anger', 'fear', 'sadness', 'joy', 'surprise', 'shame', 'guilt',
    'stress', 'calm', 'anxiety', 'excitement', 'disgust', 'contempt',
    'love', 'gratitude', 'pride', 'envy', 'other'
  )),
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  evidence TEXT NOT NULL,
  weight FLOAT NOT NULL CHECK (weight >= 0 AND weight <= 1),
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger Events Table
-- Stores emotional trigger events
CREATE TABLE IF NOT EXISTS public.trigger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  emotion_signal_id UUID REFERENCES public.emotion_signals(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'relationship', 'conflict', 'failure', 'rejection', 'stress_load',
    'identity_threat', 'rumination', 'social_comparison', 'loss',
    'change', 'uncertainty', 'criticism', 'other'
  )),
  pattern TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reaction Patterns Table
-- Stores emotional reaction patterns
CREATE TABLE IF NOT EXISTS public.reaction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'reactive', 'responsive', 'avoidant', 'impulsive', 'ruminative',
    'adaptive', 'suppressed', 'other'
  )),
  evidence TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  emotion TEXT CHECK (emotion IN (
    'anger', 'fear', 'sadness', 'joy', 'surprise', 'shame', 'guilt',
    'stress', 'calm', 'anxiety', 'excitement', 'disgust', 'contempt',
    'love', 'gratitude', 'pride', 'envy', 'other'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Regulation Scores Table
-- Stores emotional regulation scores over time
CREATE TABLE IF NOT EXISTS public.regulation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stability FLOAT NOT NULL CHECK (stability >= 0 AND stability <= 1),
  modulation FLOAT NOT NULL CHECK (modulation >= 0 AND modulation <= 1),
  delay FLOAT NOT NULL CHECK (delay >= 0 AND delay <= 1),
  resilience FLOAT NOT NULL CHECK (resilience >= 0 AND resilience <= 1),
  emotional_flexibility FLOAT NOT NULL CHECK (emotional_flexibility >= 0 AND emotional_flexibility <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EQ Insights Table
-- Stores insights about emotional intelligence
CREATE TABLE IF NOT EXISTS public.eq_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'trigger_detected', 'high_intensity', 'low_regulation', 'emotional_growth',
    'reaction_pattern', 'instability_risk', 'regulation_improvement',
    'recovery_slow', 'trigger_pattern', 'emotional_awareness'
  )),
  message TEXT NOT NULL,
  emotion TEXT CHECK (emotion IN (
    'anger', 'fear', 'sadness', 'joy', 'surprise', 'shame', 'guilt',
    'stress', 'calm', 'anxiety', 'excitement', 'disgust', 'contempt',
    'love', 'gratitude', 'pride', 'envy', 'other'
  )),
  trigger_type TEXT CHECK (trigger_type IN (
    'relationship', 'conflict', 'failure', 'rejection', 'stress_load',
    'identity_threat', 'rumination', 'social_comparison', 'loss',
    'change', 'uncertainty', 'criticism', 'other'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_emotion_signals_user_emotion ON public.emotion_signals(user_id, emotion);
CREATE INDEX IF NOT EXISTS idx_emotion_signals_timestamp ON public.emotion_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emotion_signals_intensity ON public.emotion_signals(user_id, intensity DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_events_user_type ON public.trigger_events(user_id, trigger_type);
CREATE INDEX IF NOT EXISTS idx_trigger_events_timestamp ON public.trigger_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_reaction_patterns_user_type ON public.reaction_patterns(user_id, type);
CREATE INDEX IF NOT EXISTS idx_reaction_patterns_timestamp ON public.reaction_patterns(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_regulation_scores_user_timestamp ON public.regulation_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eq_insights_user_type ON public.eq_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_eq_insights_timestamp ON public.eq_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.emotion_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trigger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reaction_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eq_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own emotion signals
CREATE POLICY "Users can view own emotion signals"
  ON public.emotion_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own emotion signals (via service)
CREATE POLICY "Users can insert own emotion signals"
  ON public.emotion_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own emotion signals
CREATE POLICY "Users can update own emotion signals"
  ON public.emotion_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own emotion signals
CREATE POLICY "Users can delete own emotion signals"
  ON public.emotion_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own trigger events
CREATE POLICY "Users can view own trigger events"
  ON public.trigger_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own trigger events (via service)
CREATE POLICY "Users can insert own trigger events"
  ON public.trigger_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own trigger events
CREATE POLICY "Users can update own trigger events"
  ON public.trigger_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own trigger events
CREATE POLICY "Users can delete own trigger events"
  ON public.trigger_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own reaction patterns
CREATE POLICY "Users can view own reaction patterns"
  ON public.reaction_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own reaction patterns (via service)
CREATE POLICY "Users can insert own reaction patterns"
  ON public.reaction_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reaction patterns
CREATE POLICY "Users can update own reaction patterns"
  ON public.reaction_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own reaction patterns
CREATE POLICY "Users can delete own reaction patterns"
  ON public.reaction_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own regulation scores
CREATE POLICY "Users can view own regulation scores"
  ON public.regulation_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own regulation scores (via service)
CREATE POLICY "Users can insert own regulation scores"
  ON public.regulation_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own regulation scores
CREATE POLICY "Users can update own regulation scores"
  ON public.regulation_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own regulation scores
CREATE POLICY "Users can delete own regulation scores"
  ON public.regulation_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own EQ insights
CREATE POLICY "Users can view own EQ insights"
  ON public.eq_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own EQ insights (via service)
CREATE POLICY "Users can insert own EQ insights"
  ON public.eq_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own EQ insights
CREATE POLICY "Users can update own EQ insights"
  ON public.eq_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own EQ insights
CREATE POLICY "Users can delete own EQ insights"
  ON public.eq_insights
  FOR DELETE
  USING (auth.uid() = user_id);

