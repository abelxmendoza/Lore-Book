-- =====================================================
-- LOREKEEPER PHASE 3.6
-- Canon & Reality Boundary System
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.entry_ir') IS NULL THEN
    RAISE NOTICE 'canon_metadata: entry_ir missing; skip';
    RETURN;
  END IF;

  ALTER TABLE public.entry_ir
  ADD COLUMN IF NOT EXISTS canon JSONB DEFAULT '{"status": "CANON", "source": "SYSTEM", "confidence": 0.6}'::jsonb;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entry_ir' AND column_name = 'canon_status'
  ) THEN
    UPDATE public.entry_ir
    SET canon = jsonb_build_object(
      'status', COALESCE(canon_status, 'CANON'),
      'source', 'SYSTEM',
      'confidence', 0.6,
      'classified_at', created_at::text
    )
    WHERE canon IS NULL OR canon = '{}'::jsonb;
  END IF;

  -- btree (not GIN): canon->>'status' is text
  CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_status
    ON public.entry_ir ((canon->>'status'));
  CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_source
    ON public.entry_ir ((canon->>'source'));

  ALTER TABLE public.entry_ir DROP CONSTRAINT IF EXISTS check_canon_status;
  ALTER TABLE public.entry_ir DROP CONSTRAINT IF EXISTS check_canon_confidence;

  ALTER TABLE public.entry_ir
  ADD CONSTRAINT check_canon_status
  CHECK (
    (canon->>'status') IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META')
  );

  ALTER TABLE public.entry_ir
  ADD CONSTRAINT check_canon_confidence
  CHECK (
    ((canon->>'confidence')::float >= 0.0 AND (canon->>'confidence')::float <= 1.0)
  );
END $$;
