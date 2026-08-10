-- =====================================================
-- META OVERRIDES
-- Purpose: Allow users to control meaning interpretation
-- without editing history or facts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.meta_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN (
    'EVENT',
    'PATTERN',
    'ENTITY',
    'TIME_RANGE',
    'GLOBAL'
  )),
  target_id UUID, -- Can be NULL for GLOBAL scope
  override_type TEXT NOT NULL CHECK (override_type IN (
    'NOT_IMPORTANT',
    'JUST_VENTING',
    'OUTDATED',
    'MISINTERPRETED',
    'DO_NOT_TRACK_PATTERN',
    'LOWER_CONFIDENCE',
    'ARCHIVE'
  )),
  user_note TEXT,
  reversible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_meta_overrides_user ON public.meta_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_overrides_target ON public.meta_overrides(scope, target_id);
CREATE INDEX IF NOT EXISTS idx_meta_overrides_type ON public.meta_overrides(override_type);
CREATE INDEX IF NOT EXISTS idx_meta_overrides_created ON public.meta_overrides(created_at DESC);

-- Unique constraint: one override per scope+target+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_overrides_unique 
  ON public.meta_overrides(user_id, scope, target_id, override_type)
  WHERE target_id IS NOT NULL;

ALTER TABLE public.meta_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meta overrides"
  ON public.meta_overrides
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own meta overrides"
  ON public.meta_overrides
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own meta overrides"
  ON public.meta_overrides
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own meta overrides"
  ON public.meta_overrides
  FOR DELETE
  USING (user_id = auth.uid());

