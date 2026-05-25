-- Values & Beliefs Engine Schema
-- Stores value signals, belief statements, conflicts, and evolution

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Value Signals Table
-- Stores individual value signals from journal entries
CREATE TABLE IF NOT EXISTS public.value_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'discipline', 'loyalty', 'honor', 'ambition', 'freedom', 'growth',
    'courage', 'creativity', 'justice', 'family', 'authenticity',
    'adventure', 'stability', 'independence', 'community', 'wisdom',
    'compassion', 'excellence', 'other'
  )),
  strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
  text TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Belief Signals Table
-- Stores belief statements (explicit or implicit)
CREATE TABLE IF NOT EXISTS public.belief_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  statement TEXT NOT NULL,
  polarity FLOAT NOT NULL CHECK (polarity >= -1 AND polarity <= 1),
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  entry_id UUID,
  is_explicit BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Value Insights Table
-- Stores insights about values, conflicts, and alignment
CREATE TABLE IF NOT EXISTS public.value_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'core_value_detected', 'value_conflict', 'value_shift', 'belief_shift',
    'misalignment', 'reinforced_value', 'emerging_value', 'identity_rewrite'
  )),
  message TEXT NOT NULL,
  category TEXT CHECK (category IN (
    'discipline', 'loyalty', 'honor', 'ambition', 'freedom', 'growth',
    'courage', 'creativity', 'justice', 'family', 'authenticity',
    'adventure', 'stability', 'independence', 'community', 'wisdom',
    'compassion', 'excellence', 'other'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_value_signals_user_category ON public.value_signals(user_id, category);
CREATE INDEX IF NOT EXISTS idx_value_signals_timestamp ON public.value_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_value_signals_strength ON public.value_signals(user_id, strength DESC);
CREATE INDEX IF NOT EXISTS idx_belief_signals_user ON public.belief_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_belief_signals_timestamp ON public.belief_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_belief_signals_explicit ON public.belief_signals(user_id, is_explicit);
CREATE INDEX IF NOT EXISTS idx_value_insights_user_type ON public.value_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_value_insights_category ON public.value_insights(user_id, category);
CREATE INDEX IF NOT EXISTS idx_value_insights_timestamp ON public.value_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.value_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.belief_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own value signals
CREATE POLICY "Users can view own value signals"
  ON public.value_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own value signals (via service)
CREATE POLICY "Users can insert own value signals"
  ON public.value_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own value signals
CREATE POLICY "Users can update own value signals"
  ON public.value_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own value signals
CREATE POLICY "Users can delete own value signals"
  ON public.value_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own belief signals
CREATE POLICY "Users can view own belief signals"
  ON public.belief_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own belief signals (via service)
CREATE POLICY "Users can insert own belief signals"
  ON public.belief_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own belief signals
CREATE POLICY "Users can update own belief signals"
  ON public.belief_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own belief signals
CREATE POLICY "Users can delete own belief signals"
  ON public.belief_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own value insights
CREATE POLICY "Users can view own value insights"
  ON public.value_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own value insights (via service)
CREATE POLICY "Users can insert own value insights"
  ON public.value_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own value insights
CREATE POLICY "Users can update own value insights"
  ON public.value_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own value insights
CREATE POLICY "Users can delete own value insights"
  ON public.value_insights
  FOR DELETE
  USING (auth.uid() = user_id);

