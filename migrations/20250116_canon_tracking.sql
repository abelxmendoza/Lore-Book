-- =====================================================
-- LOREKEEPER PHASE 4 — CANON TRACKING & REALITY BOUNDARY
-- Prevents imagination from polluting lived memory
-- =====================================================

-- Add canon_status to utterances table
ALTER TABLE public.utterances
ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));

CREATE INDEX IF NOT EXISTS idx_utterances_canon_status ON public.utterances(user_id, canon_status);

-- Add canon_status to entry_ir table
ALTER TABLE public.entry_ir
ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));

CREATE INDEX IF NOT EXISTS idx_entry_ir_canon_status ON public.entry_ir(user_id, canon_status);

-- Add canon_status to knowledge_units table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_units') THEN
    ALTER TABLE public.knowledge_units
    ADD COLUMN IF NOT EXISTS canon_status TEXT DEFAULT 'CANON'
    CHECK (canon_status IN ('CANON', 'ROLEPLAY', 'HYPOTHETICAL', 'FICTIONAL', 'THOUGHT_EXPERIMENT', 'META'));
    
    CREATE INDEX IF NOT EXISTS idx_knowledge_units_canon_status ON public.knowledge_units(user_id, canon_status);
  END IF;
END $$;

-- Update existing entries to be CANON by default (safe migration)
UPDATE public.utterances SET canon_status = 'CANON' WHERE canon_status IS NULL;
UPDATE public.entry_ir SET canon_status = 'CANON' WHERE canon_status IS NULL;

