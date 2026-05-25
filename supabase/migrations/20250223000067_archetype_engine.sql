-- Archetype Engine V1
-- Simple tables for storing archetype signals, profiles, transitions, and distortions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Archetype Signals Table
CREATE TABLE IF NOT EXISTS public.archetype_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archetype Profiles Table
CREATE TABLE IF NOT EXISTS public.archetype_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  dominant TEXT NOT NULL,
  secondary TEXT[] DEFAULT '{}',
  shadow TEXT,
  distribution JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archetype Transitions Table
CREATE TABLE IF NOT EXISTS public.archetype_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_archetype TEXT NOT NULL,
  to_archetype TEXT NOT NULL,
  weight FLOAT DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  evidence TEXT[] DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archetype Distortions Table
CREATE TABLE IF NOT EXISTS public.archetype_distortions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  distortion TEXT NOT NULL CHECK (distortion IN ('Overdrive', 'IdentitySplit', 'ShadowDominance')),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  indicators TEXT[] DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_archetype_signals_user ON public.archetype_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_archetype_signals_entry ON public.archetype_signals(entry_id);
CREATE INDEX IF NOT EXISTS idx_archetype_signals_label ON public.archetype_signals(user_id, label);
CREATE INDEX IF NOT EXISTS idx_archetype_signals_timestamp ON public.archetype_signals(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_archetype_profiles_user ON public.archetype_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_archetype_transitions_user ON public.archetype_transitions(user_id);
CREATE INDEX IF NOT EXISTS idx_archetype_transitions_timestamp ON public.archetype_transitions(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_archetype_distortions_user ON public.archetype_distortions(user_id);
CREATE INDEX IF NOT EXISTS idx_archetype_distortions_archetype ON public.archetype_distortions(user_id, archetype);
CREATE INDEX IF NOT EXISTS idx_archetype_distortions_timestamp ON public.archetype_distortions(user_id, timestamp DESC);

-- RLS
ALTER TABLE public.archetype_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archetype_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archetype_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archetype_distortions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own archetype signals"
  ON public.archetype_signals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archetype signals"
  ON public.archetype_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own archetype signals"
  ON public.archetype_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own archetype signals"
  ON public.archetype_signals
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own archetype profiles"
  ON public.archetype_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archetype profiles"
  ON public.archetype_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own archetype profiles"
  ON public.archetype_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own archetype transitions"
  ON public.archetype_transitions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archetype transitions"
  ON public.archetype_transitions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own archetype distortions"
  ON public.archetype_distortions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archetype distortions"
  ON public.archetype_distortions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

