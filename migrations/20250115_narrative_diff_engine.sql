-- =====================================================
-- NARRATIVE DIFF & IDENTITY EVOLUTION ENGINE (NDIE)
-- Purpose: Track how beliefs, interpretations, emotions, and values
-- evolve over time WITHOUT rewriting history or asserting truth.
-- =====================================================

-- Narrative Diffs Table
-- Tracks observational changes in beliefs, interpretations, emotions, values
CREATE TABLE IF NOT EXISTS public.narrative_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('SELF', 'ENTITY', 'THEME')),
  subject_id TEXT NOT NULL, -- Entity ID, theme name, or 'self'
  diff_type TEXT NOT NULL CHECK (diff_type IN (
    'BELIEF_STRENGTHENED',
    'BELIEF_WEAKENED',
    'BELIEF_ABANDONED',
    'INTERPRETATION_SHIFT',
    'EMOTIONAL_CHANGE',
    'VALUE_REPRIORITIZATION'
  )),
  from_content TEXT NOT NULL,
  from_knowledge_type TEXT NOT NULL CHECK (from_knowledge_type IN (
    'EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'
  )),
  from_confidence FLOAT NOT NULL CHECK (from_confidence >= 0 AND from_confidence <= 1),
  from_timestamp TIMESTAMPTZ NOT NULL,
  to_content TEXT NOT NULL,
  to_knowledge_type TEXT NOT NULL CHECK (to_knowledge_type IN (
    'EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'
  )),
  to_confidence FLOAT NOT NULL CHECK (to_confidence >= 0 AND to_confidence <= 1),
  to_timestamp TIMESTAMPTZ NOT NULL,
  evidence_entry_ids UUID[] DEFAULT '{}', -- Array of entry_ir IDs that provide evidence
  contract_type TEXT, -- Which contract was used to generate this diff
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_user ON public.narrative_diffs(user_id);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_subject ON public.narrative_diffs(user_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_type ON public.narrative_diffs(user_id, diff_type);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_timestamp ON public.narrative_diffs(user_id, to_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_contract ON public.narrative_diffs(user_id, contract_type);

-- GIN index for evidence_entry_ids array search
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_evidence_gin ON public.narrative_diffs USING GIN(evidence_entry_ids);

-- RLS Policies
ALTER TABLE public.narrative_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative diffs"
  ON public.narrative_diffs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own narrative diffs"
  ON public.narrative_diffs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: No UPDATE or DELETE policies - diffs are read-only, observational records

