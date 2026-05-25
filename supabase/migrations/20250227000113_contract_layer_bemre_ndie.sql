-- =====================================================
-- LOREKEEPER CORE BLUEPRINT
-- Sensemaking Contract Layer, BEMRE, NDIE
-- =====================================================

-- Belief Evolutions Table (BEMRE)
CREATE TABLE IF NOT EXISTS public.belief_evolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  belief_entry_id UUID NOT NULL REFERENCES entry_ir(id) ON DELETE CASCADE,
  belief_content TEXT NOT NULL,
  initial_timestamp TIMESTAMPTZ NOT NULL,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONTRADICTED', 'ABANDONED', 'UNRESOLVED')),
  supporting_evidence_ids UUID[] DEFAULT '{}',
  contradicting_evidence_ids UUID[] DEFAULT '{}',
  evolution_timeline JSONB DEFAULT '[]'::jsonb,
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, belief_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_belief_evolutions_user ON public.belief_evolutions(user_id);
CREATE INDEX IF NOT EXISTS idx_belief_evolutions_entry ON public.belief_evolutions(belief_entry_id);
CREATE INDEX IF NOT EXISTS idx_belief_evolutions_status ON public.belief_evolutions(resolution_status);

-- Narrative Diffs Table (NDIE)
CREATE TABLE IF NOT EXISTS public.narrative_diffs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id_1 UUID NOT NULL REFERENCES entry_ir(id) ON DELETE CASCADE,
  entry_id_2 UUID NOT NULL REFERENCES entry_ir(id) ON DELETE CASCADE,
  evolution_type TEXT NOT NULL CHECK (evolution_type IN ('BELIEF_STRENGTH_CHANGE', 'BELIEF_ABANDONMENT', 'EMOTIONAL_SHIFT', 'INTERPRETATION_SHIFT', 'VALUE_REPRIORITIZATION', 'CONFIDENCE_CHANGE', 'ENTITY_RELATIONSHIP_CHANGE')),
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION')),
  shared_entities TEXT[] DEFAULT '{}',
  shared_themes TEXT[] DEFAULT '{}',
  diff_description TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_diffs_user ON public.narrative_diffs(user_id);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_entry_1 ON public.narrative_diffs(entry_id_1);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_entry_2 ON public.narrative_diffs(entry_id_2);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_evolution_type ON public.narrative_diffs(evolution_type);
CREATE INDEX IF NOT EXISTS idx_narrative_diffs_detected_at ON public.narrative_diffs(detected_at DESC);

-- RLS Policies
ALTER TABLE public.belief_evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own belief evolutions"
  ON public.belief_evolutions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own belief evolutions"
  ON public.belief_evolutions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own belief evolutions"
  ON public.belief_evolutions
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own narrative diffs"
  ON public.narrative_diffs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own narrative diffs"
  ON public.narrative_diffs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

