-- =====================================================
-- SKILL RELATIONSHIPS
-- Purpose: Track relationships between skills (prerequisites, synergies, learning paths)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.skill_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  to_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'prerequisite_for',      -- Skill A is required before Skill B
    'requires',              -- Skill A requires Skill B
    'builds_on',             -- Skill A builds on Skill B
    'foundation_for',        -- Skill A is foundation for Skill B
    'complements',           -- Skills that work well together
    'synergizes_with',       -- Skills that enhance each other
    'related_to',            -- Generally related skills
    'specialization_of',     -- Skill A is specialization of Skill B
    'generalization_of',     -- Skill A is generalization of Skill B
    'alternative_to',        -- Alternative ways to achieve same goal
    'evolves_into',          -- Skill A naturally evolves into Skill B
    'learned_with',          -- Skills learned together
    'practiced_with',        -- Skills practiced together
    'taught_with',          -- Skills taught together
    'transfers_to',         -- Skill knowledge transfers to another
    'applies_to'            -- Skill applies to another domain
  )),
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1), -- How strong the relationship is
  evidence_count INT DEFAULT 1,
  evidence_source_ids UUID[], -- IDs of messages/journal entries that support this
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, from_skill_id, to_skill_id, relationship_type)
);

-- Skill Clusters (groups of related skills)
CREATE TABLE IF NOT EXISTS public.skill_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL, -- e.g., "Web Development", "Data Science", "Music Production"
  skill_ids UUID[] NOT NULL, -- Array of skill IDs in this cluster
  cluster_type TEXT, -- 'domain', 'learning_path', 'toolset', 'discipline'
  description TEXT,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cluster_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_relationships_user ON public.skill_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_from ON public.skill_relationships(from_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_to ON public.skill_relationships(to_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_type ON public.skill_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_skill_clusters_user ON public.skill_clusters(user_id);

-- RLS
ALTER TABLE public.skill_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own skill relationships"
  ON public.skill_relationships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own skill relationships"
  ON public.skill_relationships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own skill relationships"
  ON public.skill_relationships FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own skill relationships"
  ON public.skill_relationships FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own skill clusters"
  ON public.skill_clusters FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own skill clusters"
  ON public.skill_clusters FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own skill clusters"
  ON public.skill_clusters FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own skill clusters"
  ON public.skill_clusters FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.skill_relationships IS 'Tracks relationships between skills (prerequisites, synergies, learning paths)';
COMMENT ON TABLE public.skill_clusters IS 'Groups related skills into clusters (domains, learning paths, toolsets)';
