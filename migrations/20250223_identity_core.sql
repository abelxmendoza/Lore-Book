-- Identity Core Engine V1
-- Extracts the essence of who you are from journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Identity Signals Table
CREATE TABLE IF NOT EXISTS public.identity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'value',
    'belief',
    'desire',
    'fear',
    'strength',
    'weakness',
    'self_label',
    'shadow',
    'aspiration',
    'identity_statement'
  )),
  text TEXT NOT NULL,
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  weight NUMERIC CHECK (weight >= 0 AND weight <= 1),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity Dimensions Table
CREATE TABLE IF NOT EXISTS public.identity_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES identity_core_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score NUMERIC CHECK (score >= 0 AND score <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity Dimension Signals (many-to-many)
CREATE TABLE IF NOT EXISTS public.identity_dimension_signals (
  dimension_id UUID NOT NULL REFERENCES identity_dimensions(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES identity_signals(id) ON DELETE CASCADE,
  PRIMARY KEY (dimension_id, signal_id)
);

-- Identity Conflicts Table
CREATE TABLE IF NOT EXISTS public.identity_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES identity_core_profiles(id) ON DELETE CASCADE,
  conflict_name TEXT NOT NULL,
  positive_side TEXT NOT NULL,
  negative_side TEXT NOT NULL,
  evidence TEXT[] DEFAULT '{}',
  tension NUMERIC CHECK (tension >= 0 AND tension <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Identity Core Profiles Table
CREATE TABLE IF NOT EXISTS public.identity_core_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimensions JSONB DEFAULT '[]',
  conflicts JSONB DEFAULT '[]',
  stability JSONB DEFAULT '{}',
  projection JSONB DEFAULT '{}',
  summary TEXT,
  profile_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_identity_signals_user_time ON public.identity_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_identity_signals_memory ON public.identity_signals(memory_id);
CREATE INDEX IF NOT EXISTS idx_identity_signals_type ON public.identity_signals(user_id, type);
CREATE INDEX IF NOT EXISTS idx_identity_dimensions_user ON public.identity_dimensions(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_dimensions_profile ON public.identity_dimensions(profile_id);
CREATE INDEX IF NOT EXISTS idx_identity_conflicts_user ON public.identity_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_conflicts_profile ON public.identity_conflicts(profile_id);
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_user ON public.identity_core_profiles(user_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_identity_signals_embedding ON public.identity_signals 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for JSONB
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_dimensions_gin ON public.identity_core_profiles USING GIN(dimensions);
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_conflicts_gin ON public.identity_core_profiles USING GIN(conflicts);
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_stability_gin ON public.identity_core_profiles USING GIN(stability);
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_projection_gin ON public.identity_core_profiles USING GIN(projection);
CREATE INDEX IF NOT EXISTS idx_identity_core_profiles_profile_data_gin ON public.identity_core_profiles USING GIN(profile_data);
CREATE INDEX IF NOT EXISTS idx_identity_conflicts_evidence_gin ON public.identity_conflicts USING GIN(evidence);

-- RLS
ALTER TABLE public.identity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_dimension_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_core_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own identity signals"
  ON public.identity_signals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own identity signals"
  ON public.identity_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own identity signals"
  ON public.identity_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own identity signals"
  ON public.identity_signals
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own identity dimensions"
  ON public.identity_dimensions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own identity dimensions"
  ON public.identity_dimensions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own identity conflicts"
  ON public.identity_conflicts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own identity conflicts"
  ON public.identity_conflicts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own identity core profiles"
  ON public.identity_core_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own identity core profiles"
  ON public.identity_core_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own identity core profiles"
  ON public.identity_core_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own identity core profiles"
  ON public.identity_core_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

