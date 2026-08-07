-- Dreams & Aspirations Engine Schema
-- Stores dream signals, aspiration statements, and evolution

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dream Signals Table
-- Stores individual dream signals from journal entries
CREATE TABLE IF NOT EXISTS public.dream_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'career', 'creative', 'martial', 'relationship', 'financial',
    'personal', 'lifestyle', 'legacy', 'health', 'education',
    'adventure', 'family', 'other'
  )),
  clarity FLOAT NOT NULL CHECK (clarity >= 0 AND clarity <= 1),
  desire FLOAT NOT NULL CHECK (desire >= 0 AND desire <= 1),
  text TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aspiration Signals Table
-- Stores aspiration statements (more emotional, less concrete)
CREATE TABLE IF NOT EXISTS public.aspiration_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  statement TEXT NOT NULL,
  polarity FLOAT NOT NULL CHECK (polarity >= -1 AND polarity <= 1),
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dream Insights Table
-- Stores insights about dreams, conflicts, and evolution
CREATE TABLE IF NOT EXISTS public.dream_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'core_dream_detected', 'dream_shift', 'dream_strengthening',
    'dream_conflict', 'dream_decay', 'dream_alignment', 'aspiration_reinforced'
  )),
  message TEXT NOT NULL,
  category TEXT CHECK (category IN (
    'career', 'creative', 'martial', 'relationship', 'financial',
    'personal', 'lifestyle', 'legacy', 'health', 'education',
    'adventure', 'family', 'other'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_dream_signals_user_category ON public.dream_signals(user_id, category);
CREATE INDEX IF NOT EXISTS idx_dream_signals_timestamp ON public.dream_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dream_signals_desire ON public.dream_signals(user_id, desire DESC);
CREATE INDEX IF NOT EXISTS idx_dream_signals_clarity ON public.dream_signals(user_id, clarity DESC);
CREATE INDEX IF NOT EXISTS idx_aspiration_signals_user ON public.aspiration_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_aspiration_signals_timestamp ON public.aspiration_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dream_insights_user_type ON public.dream_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_dream_insights_category ON public.dream_insights(user_id, category);
CREATE INDEX IF NOT EXISTS idx_dream_insights_timestamp ON public.dream_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.dream_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aspiration_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own dream signals
CREATE POLICY "Users can view own dream signals"
  ON public.dream_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own dream signals (via service)
CREATE POLICY "Users can insert own dream signals"
  ON public.dream_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own dream signals
CREATE POLICY "Users can update own dream signals"
  ON public.dream_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own dream signals
CREATE POLICY "Users can delete own dream signals"
  ON public.dream_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own aspiration signals
CREATE POLICY "Users can view own aspiration signals"
  ON public.aspiration_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own aspiration signals (via service)
CREATE POLICY "Users can insert own aspiration signals"
  ON public.aspiration_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own aspiration signals
CREATE POLICY "Users can update own aspiration signals"
  ON public.aspiration_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own aspiration signals
CREATE POLICY "Users can delete own aspiration signals"
  ON public.aspiration_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own dream insights
CREATE POLICY "Users can view own dream insights"
  ON public.dream_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own dream insights (via service)
CREATE POLICY "Users can insert own dream insights"
  ON public.dream_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own dream insights
CREATE POLICY "Users can update own dream insights"
  ON public.dream_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own dream insights
CREATE POLICY "Users can delete own dream insights"
  ON public.dream_insights
  FOR DELETE
  USING (auth.uid() = user_id);

