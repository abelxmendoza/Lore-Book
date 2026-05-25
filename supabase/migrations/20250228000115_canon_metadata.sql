-- =====================================================
-- LOREKEEPER PHASE 3.6
-- Canon & Reality Boundary System
-- =====================================================

-- Update entry_ir table to use canon metadata instead of simple status
-- Note: This migration assumes canon_status column exists
-- If it doesn't, create it first, then migrate to canon JSONB

-- Add canon metadata column (JSONB for flexibility)
ALTER TABLE public.entry_ir
ADD COLUMN IF NOT EXISTS canon JSONB DEFAULT '{"status": "CANON", "source": "SYSTEM", "confidence": 0.6}'::jsonb;

-- Migrate existing canon_status to canon metadata if canon_status exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entry_ir' AND column_name = 'canon_status'
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
END $$;

-- Create index on canon status for filtering
CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_status 
ON public.entry_ir USING GIN ((canon->>'status'));

-- Create index on canon source for auditing
CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_source 
ON public.entry_ir ((canon->>'source'));

-- Add constraint to ensure canon.status is valid
ALTER TABLE public.entry_ir
ADD CONSTRAINT check_canon_status 
CHECK (
  (canon->>'status') IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META')
);

-- Add constraint to ensure canon.confidence is valid
ALTER TABLE public.entry_ir
ADD CONSTRAINT check_canon_confidence 
CHECK (
  ((canon->>'confidence')::float >= 0.0 AND (canon->>'confidence')::float <= 1.0)
);

