-- Engine Runtime System
-- Stores results from all engine runs

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Engine Results Table
CREATE TABLE IF NOT EXISTS public.engine_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  results JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engine_results_user ON public.engine_results(user_id);
CREATE INDEX IF NOT EXISTS idx_engine_results_updated ON public.engine_results(updated_at DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_engine_results_results_gin ON public.engine_results USING GIN(results);

-- RLS
ALTER TABLE public.engine_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own engine results"
  ON public.engine_results
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own engine results"
  ON public.engine_results
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own engine results"
  ON public.engine_results
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own engine results"
  ON public.engine_results
  FOR DELETE
  USING (auth.uid() = user_id);

