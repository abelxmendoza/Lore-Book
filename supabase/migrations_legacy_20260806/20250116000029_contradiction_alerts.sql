-- =====================================================
-- CONTRADICTION ALERTS TABLE
-- Purpose: Surface "You Might Be Wrong" moments
-- when beliefs are contradicted or confidence drops
-- =====================================================

CREATE TABLE IF NOT EXISTS public.contradiction_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  belief_unit_id UUID NOT NULL REFERENCES knowledge_units(id) ON DELETE CASCADE,
  belief_content TEXT NOT NULL,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN (
    'UNRESOLVED', 'SUPPORTED', 'CONTRADICTED', 'PARTIALLY_SUPPORTED', 'ABANDONED'
  )),
  resolution_confidence FLOAT NOT NULL CHECK (resolution_confidence >= 0 AND resolution_confidence <= 1),
  contradicting_evidence_ids UUID[] DEFAULT '{}',
  supporting_evidence_ids UUID[] DEFAULT '{}',
  suggested_action TEXT NOT NULL CHECK (suggested_action IN ('REVIEW', 'ABANDON', 'DISMISS', 'NOT_NOW')),
  user_action TEXT CHECK (user_action IN ('REVIEW', 'ABANDON', 'DISMISS', 'NOT_NOW')),
  dismissed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contradiction_alerts_user ON public.contradiction_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_alerts_belief ON public.contradiction_alerts(user_id, belief_unit_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_alerts_active ON public.contradiction_alerts(user_id, dismissed_at) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contradiction_alerts_created ON public.contradiction_alerts(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE public.contradiction_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contradiction alerts"
  ON public.contradiction_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contradiction alerts"
  ON public.contradiction_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contradiction alerts"
  ON public.contradiction_alerts
  FOR UPDATE
  USING (auth.uid() = user_id);

