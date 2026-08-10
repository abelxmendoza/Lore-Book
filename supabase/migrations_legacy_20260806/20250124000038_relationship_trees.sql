-- =====================================================
-- RELATIONSHIP TREES
-- Purpose: Store relationship trees for any person/entity
-- Enables building family trees, professional networks, etc. for anyone
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Store relationship trees for any person
CREATE TABLE IF NOT EXISTS public.relationship_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  root_entity_id UUID NOT NULL,
  root_entity_type TEXT NOT NULL CHECK (root_entity_type IN ('omega_entity', 'character')),
  tree_data JSONB NOT NULL, -- Full tree structure
  member_count INT DEFAULT 0,
  relationship_count INT DEFAULT 0,
  categories TEXT[], -- ['family', 'professional', 'educational', 'social', 'residential']
  confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, root_entity_id, root_entity_type)
);

-- Track inferred relationships (transitive)
CREATE TABLE IF NOT EXISTS public.inferred_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL,
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('omega_entity', 'character')),
  to_entity_id UUID NOT NULL,
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('omega_entity', 'character')),
  inferred_relationship TEXT NOT NULL,
  inference_path TEXT[], -- Path of relationships that led to this inference
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  inference_method TEXT, -- 'transitive', 'llm', 'pattern', 'attribute_match'
  evidence TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, from_entity_id, from_entity_type, to_entity_id, to_entity_type, inferred_relationship)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_relationship_trees_user ON public.relationship_trees(user_id);
CREATE INDEX IF NOT EXISTS idx_relationship_trees_root ON public.relationship_trees(root_entity_id, root_entity_type);
CREATE INDEX IF NOT EXISTS idx_inferred_relationships_user ON public.inferred_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_inferred_relationships_from ON public.inferred_relationships(from_entity_id, from_entity_type);
CREATE INDEX IF NOT EXISTS idx_inferred_relationships_to ON public.inferred_relationships(to_entity_id, to_entity_type);

-- RLS
ALTER TABLE public.relationship_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inferred_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own relationship trees"
  ON public.relationship_trees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relationship trees"
  ON public.relationship_trees FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own relationship trees"
  ON public.relationship_trees FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own relationship trees"
  ON public.relationship_trees FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own inferred relationships"
  ON public.inferred_relationships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own inferred relationships"
  ON public.inferred_relationships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own inferred relationships"
  ON public.inferred_relationships FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own inferred relationships"
  ON public.inferred_relationships FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.relationship_trees IS 'Stores relationship trees for any person/entity (family, professional, educational, social)';
COMMENT ON TABLE public.inferred_relationships IS 'Tracks inferred relationships through transitive logic or pattern matching';
