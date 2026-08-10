-- =====================================================
-- LOREKEEPER PHASE 4 — CANON TRACKING & REALITY BOUNDARY
-- Prevents imagination from polluting lived memory
-- =====================================================

-- Add canon_status to utterances table (created earlier in the chain)
ALTER TABLE public.utterances
ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));

CREATE INDEX IF NOT EXISTS idx_utterances_canon_status ON public.utterances(user_id, canon_status);

-- entry_ir is created in a later migration (20250225...); guard alters.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'entry_ir'
  ) THEN
    ALTER TABLE public.entry_ir
    ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
    CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));

    CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_status ON public.entry_ir(user_id, canon_status);

    UPDATE public.entry_ir SET canon_status = 'CANON' WHERE canon_status IS NULL;
  END IF;
END $$;

-- Add canon_status to knowledge_units table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_units'
  ) THEN
    ALTER TABLE public.knowledge_units
    ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
    CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));

    CREATE INDEX IF NOT EXISTS idx_knowledge_units_canon_status ON public.knowledge_units(user_id, canon_status);
  END IF;
END $$;

-- Update existing utterances to be CANON by default (safe migration)
UPDATE public.utterances SET canon_status = 'CANON' WHERE canon_status IS NULL;
