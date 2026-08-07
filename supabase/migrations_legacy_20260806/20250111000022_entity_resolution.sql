-- =====================================================
-- ENTITY RESOLUTION TABLES
-- Purpose: Track entity conflicts, merges, and resolution history
-- =====================================================

-- Entity Conflicts Table
CREATE TABLE IF NOT EXISTS public.entity_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_a_id UUID NOT NULL, -- Can reference characters, locations, or generic entities
  entity_b_id UUID NOT NULL,
  entity_a_type TEXT NOT NULL CHECK (entity_a_type IN (
    'CHARACTER',
    'LOCATION',
    'ENTITY',
    'ORG',
    'CONCEPT'
  )),
  entity_b_type TEXT NOT NULL CHECK (entity_b_type IN (
    'CHARACTER',
    'LOCATION',
    'ENTITY',
    'ORG',
    'CONCEPT'
  )),
  similarity_score FLOAT NOT NULL,
  conflict_reason TEXT NOT NULL CHECK (conflict_reason IN (
    'NAME_SIMILARITY',
    'CONTEXT_OVERLAP',
    'COREFERENCE',
    'TEMPORAL_OVERLAP'
  )),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'MERGED', 'DISMISSED')) DEFAULT 'OPEN',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_entity_conflicts_user ON public.entity_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_conflicts_status ON public.entity_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_entity_conflicts_entities ON public.entity_conflicts(entity_a_id, entity_b_id);
CREATE INDEX IF NOT EXISTS idx_entity_conflicts_similarity ON public.entity_conflicts(similarity_score DESC);

ALTER TABLE public.entity_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity conflicts"
  ON public.entity_conflicts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity conflicts"
  ON public.entity_conflicts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity conflicts"
  ON public.entity_conflicts
  FOR UPDATE
  USING (user_id = auth.uid());

-- Entity Merge Records Table
CREATE TABLE IF NOT EXISTS public.entity_merge_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL,
  target_entity_id UUID NOT NULL,
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN (
    'CHARACTER',
    'LOCATION',
    'ENTITY',
    'ORG',
    'CONCEPT'
  )),
  target_entity_type TEXT NOT NULL CHECK (target_entity_type IN (
    'CHARACTER',
    'LOCATION',
    'ENTITY',
    'ORG',
    'CONCEPT'
  )),
  merged_by TEXT NOT NULL CHECK (merged_by IN ('SYSTEM', 'USER')) DEFAULT 'USER',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversible BOOLEAN NOT NULL DEFAULT true,
  reverted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_entity_merge_records_user ON public.entity_merge_records(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_merge_records_source ON public.entity_merge_records(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merge_records_target ON public.entity_merge_records(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merge_records_created ON public.entity_merge_records(created_at DESC);

ALTER TABLE public.entity_merge_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity merge records"
  ON public.entity_merge_records
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity merge records"
  ON public.entity_merge_records
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity merge records"
  ON public.entity_merge_records
  FOR UPDATE
  USING (user_id = auth.uid());

