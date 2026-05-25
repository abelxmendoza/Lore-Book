-- =====================================================
-- CORRECTION RECORDS TABLE
-- Purpose: Track all corrections, contradictions, and deprecated knowledge
-- =====================================================

CREATE TABLE IF NOT EXISTS public.correction_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'CLAIM',
    'UNIT',
    'EVENT',
    'ENTITY'
  )),
  target_id UUID NOT NULL,
  correction_type TEXT NOT NULL CHECK (correction_type IN (
    'AUTO_CONTRADICTION',
    'CONFIDENCE_DOWNGRADE',
    'USER_CORRECTION',
    'OVERRIDE_APPLIED',
    'ENTITY_MERGE'
  )),
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  reason TEXT,
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('SYSTEM', 'USER')),
  reversible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_correction_records_user ON public.correction_records(user_id);
CREATE INDEX IF NOT EXISTS idx_correction_records_target ON public.correction_records(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_correction_records_created ON public.correction_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_correction_records_type ON public.correction_records(correction_type);

ALTER TABLE public.correction_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own correction records"
  ON public.correction_records
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own correction records"
  ON public.correction_records
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own correction records"
  ON public.correction_records
  FOR UPDATE
  USING (user_id = auth.uid());

-- =====================================================
-- CONTRADICTION REVIEWS TABLE
-- Purpose: Track open contradictions that need user review
-- =====================================================

CREATE TABLE IF NOT EXISTS public.contradiction_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_a_id UUID NOT NULL REFERENCES public.extracted_units(id) ON DELETE CASCADE,
  unit_b_id UUID NOT NULL REFERENCES public.extracted_units(id) ON DELETE CASCADE,
  contradiction_type TEXT NOT NULL CHECK (contradiction_type IN (
    'TEMPORAL',
    'FACTUAL',
    'PERSPECTIVE'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'DISMISSED', 'RESOLVED')) DEFAULT 'OPEN',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contradiction_reviews_user ON public.contradiction_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_reviews_status ON public.contradiction_reviews(status);
CREATE INDEX IF NOT EXISTS idx_contradiction_reviews_severity ON public.contradiction_reviews(severity DESC);
CREATE INDEX IF NOT EXISTS idx_contradiction_reviews_units ON public.contradiction_reviews(unit_a_id, unit_b_id);

ALTER TABLE public.contradiction_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contradiction reviews"
  ON public.contradiction_reviews
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own contradiction reviews"
  ON public.contradiction_reviews
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own contradiction reviews"
  ON public.contradiction_reviews
  FOR UPDATE
  USING (user_id = auth.uid());

