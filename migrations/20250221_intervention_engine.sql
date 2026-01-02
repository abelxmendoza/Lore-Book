-- Intervention Engine Schema
-- Stores detected interventions and warnings

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Interventions Table
-- Stores all detected interventions
CREATE TABLE IF NOT EXISTS public.interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'mood_spiral', 'negative_pattern', 'identity_drift',
    'relationship_drift', 'abandoned_goal', 'contradiction',
    'risk_event', 'contextual_warning'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  related_events UUID[] DEFAULT '{}',
  related_entries UUID[] DEFAULT '{}',
  context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_interventions_user_status ON public.interventions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_interventions_user_severity ON public.interventions(user_id, severity DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_interventions_user_type ON public.interventions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_interventions_timestamp ON public.interventions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_critical ON public.interventions(user_id, created_at DESC) WHERE severity = 'critical' AND status = 'pending';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own interventions
CREATE POLICY "Users can view own interventions"
  ON public.interventions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own interventions (via service)
CREATE POLICY "Users can insert own interventions"
  ON public.interventions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own interventions
CREATE POLICY "Users can update own interventions"
  ON public.interventions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own interventions
CREATE POLICY "Users can delete own interventions"
  ON public.interventions
  FOR DELETE
  USING (auth.uid() = user_id);

