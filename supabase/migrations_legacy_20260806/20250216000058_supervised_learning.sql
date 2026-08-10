-- Supervised Learning Models Storage
-- Stores trained ML models and their metadata

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ML Models Table: Store trained models
CREATE TABLE IF NOT EXISTS public.ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL CHECK (model_type IN (
    'pattern_classifier',
    'outcome_predictor',
    'alignment_regressor'
  )),
  weights JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, user_id, model_type)
);

-- Add pattern_type column to journal_entries if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' AND column_name = 'pattern_type'
  ) THEN
    ALTER TABLE public.journal_entries 
    ADD COLUMN pattern_type TEXT CHECK (pattern_type IN (
      'growth',
      'maintenance',
      'recovery',
      'avoidance_spiral',
      'burnout_risk',
      'stagnation'
    ));
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ml_models_user_type 
  ON public.ml_models(user_id, model_type);

CREATE INDEX IF NOT EXISTS idx_ml_models_updated 
  ON public.ml_models(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_pattern 
  ON public.journal_entries(user_id, pattern_type) WHERE pattern_type IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ML models"
  ON public.ml_models FOR ALL
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.ml_models IS 'Stores trained supervised learning models (pattern classifier, outcome predictor, alignment regressor)';
COMMENT ON COLUMN public.journal_entries.pattern_type IS 'Life pattern classification for entry (growth, maintenance, recovery, etc.)';
