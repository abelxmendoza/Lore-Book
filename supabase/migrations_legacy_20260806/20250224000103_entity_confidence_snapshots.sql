-- =====================================================
-- ENTITY CONFIDENCE SNAPSHOTS
-- Purpose: Track how entity confidence evolves over time
-- Based on analytics signals, usage patterns, and user feedback
-- =====================================================

CREATE TABLE IF NOT EXISTS public.entity_confidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  derived_from TEXT NOT NULL CHECK (derived_from IN ('USAGE', 'ANALYTICS', 'MERGE', 'CORRECTION', 'DECAY')),
  reason TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_entity_confidence_snapshots_entity ON public.entity_confidence_snapshots(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_confidence_snapshots_user ON public.entity_confidence_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_confidence_snapshots_timestamp ON public.entity_confidence_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_entity_confidence_snapshots_derived_from ON public.entity_confidence_snapshots(derived_from);

ALTER TABLE public.entity_confidence_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity confidence snapshots"
  ON public.entity_confidence_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity confidence snapshots"
  ON public.entity_confidence_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Add confidence override tracking to entities table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'confidence_override'
  ) THEN
    ALTER TABLE public.entities 
    ADD COLUMN confidence_override JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

