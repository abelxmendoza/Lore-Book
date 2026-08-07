-- =====================================================
-- BELIEF–REALITY RECONCILIATION ENGINE (BRRE)
-- Purpose: Track how beliefs evolve, resolve, or stay uncertain
-- by comparing them against evidence (EXPERIENCE and FACT units)
-- =====================================================

-- Belief Resolutions Table
-- Tracks the lifecycle and resolution status of beliefs
CREATE TABLE IF NOT EXISTS public.belief_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  belief_unit_id UUID NOT NULL REFERENCES knowledge_units(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'UNRESOLVED',          -- still open, no evidence yet
    'SUPPORTED',           -- evidence aligns with belief
    'CONTRADICTED',        -- evidence conflicts with belief
    'PARTIALLY_SUPPORTED', -- mixed evidence
    'ABANDONED'            -- user or time-based abandonment
  )),
  supporting_units UUID[] DEFAULT '{}', -- Array of knowledge_unit_ids that support
  contradicting_units UUID[] DEFAULT '{}', -- Array of knowledge_unit_ids that contradict
  resolution_confidence FLOAT DEFAULT 0.5 CHECK (resolution_confidence >= 0 AND resolution_confidence <= 1),
  explanation TEXT, -- Human-readable explanation of resolution
  last_evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_user ON public.belief_resolutions(user_id);
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_belief ON public.belief_resolutions(belief_unit_id);
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_status ON public.belief_resolutions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_evaluated ON public.belief_resolutions(user_id, last_evaluated_at DESC);

-- GIN index for supporting/contradicting units array search
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_supporting_gin ON public.belief_resolutions USING GIN(supporting_units);
CREATE INDEX IF NOT EXISTS idx_belief_resolutions_contradicting_gin ON public.belief_resolutions USING GIN(contradicting_units);

-- RLS Policies
ALTER TABLE public.belief_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own belief resolutions"
  ON public.belief_resolutions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own belief resolutions"
  ON public.belief_resolutions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own belief resolutions"
  ON public.belief_resolutions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own belief resolutions"
  ON public.belief_resolutions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_belief_resolution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_belief_resolutions_updated_at
  BEFORE UPDATE ON public.belief_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION update_belief_resolution_updated_at();

