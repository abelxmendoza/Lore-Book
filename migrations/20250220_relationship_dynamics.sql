-- Relationship Dynamics Engine Schema
-- Tracks relationship evolution, health, and interaction patterns

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Relationship Dynamics Table
-- Stores relationship analysis and dynamics
CREATE TABLE IF NOT EXISTS public.relationship_dynamics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle JSONB NOT NULL DEFAULT '{}'::jsonb,
  interactions JSONB[] DEFAULT '{}',
  first_mentioned TIMESTAMPTZ NOT NULL,
  last_mentioned TIMESTAMPTZ NOT NULL,
  total_interactions INT DEFAULT 0,
  common_topics TEXT[] DEFAULT '{}',
  relationship_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person_name)
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_relationship_dynamics_user ON public.relationship_dynamics(user_id);
CREATE INDEX IF NOT EXISTS idx_relationship_dynamics_person ON public.relationship_dynamics(user_id, person_name);
CREATE INDEX IF NOT EXISTS idx_relationship_dynamics_last_mentioned ON public.relationship_dynamics(user_id, last_mentioned DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_dynamics_health ON public.relationship_dynamics(user_id, (health->>'health_score')) WHERE (health->>'health_score') IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.relationship_dynamics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own relationship dynamics
CREATE POLICY "Users can view own relationship dynamics"
  ON public.relationship_dynamics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own relationship dynamics (via service)
CREATE POLICY "Users can insert own relationship dynamics"
  ON public.relationship_dynamics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own relationship dynamics
CREATE POLICY "Users can update own relationship dynamics"
  ON public.relationship_dynamics
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own relationship dynamics
CREATE POLICY "Users can delete own relationship dynamics"
  ON public.relationship_dynamics
  FOR DELETE
  USING (auth.uid() = user_id);

