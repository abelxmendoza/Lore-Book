-- Prediction Engine Schema
-- Stores predictions and forecasts based on pattern analysis

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Predictions Table
-- Stores all generated predictions
CREATE TABLE IF NOT EXISTS public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'event', 'pattern', 'mood', 'relationship', 
    'goal', 'behavior', 'trend', 'recurrence'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  predicted_value TEXT,
  predicted_date TIMESTAMPTZ,
  predicted_date_range JSONB,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high', 'very_high')),
  confidence_score FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'refuted', 'partial', 'expired')),
  source_patterns TEXT[] DEFAULT '{}',
  source_data JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_predictions_user_status ON public.predictions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_predictions_user_type ON public.predictions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_date ON public.predictions(predicted_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_predictions_expires ON public.predictions(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_predictions_confidence ON public.predictions(user_id, confidence_score DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_predictions_user_created ON public.predictions(user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own predictions
CREATE POLICY "Users can view own predictions"
  ON public.predictions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own predictions (via service)
CREATE POLICY "Users can insert own predictions"
  ON public.predictions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own predictions
CREATE POLICY "Users can update own predictions"
  ON public.predictions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own predictions
CREATE POLICY "Users can delete own predictions"
  ON public.predictions
  FOR DELETE
  USING (auth.uid() = user_id);

