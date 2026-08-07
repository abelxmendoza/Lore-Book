-- Entity Scopes and Relationship Detection
-- Enables entities to have scopes (context) and tracks relationships between entities

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entity Scopes Table
-- Tracks what context/scope an entity belongs to
CREATE TABLE IF NOT EXISTS public.entity_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL, -- References omega_entities.id or characters.id (polymorphic)
  entity_type TEXT NOT NULL CHECK (entity_type IN ('omega_entity', 'character')),
  scope TEXT NOT NULL, -- e.g., 'recruiting', 'employment', 'vendor', 'family', 'job_search'
  scope_context TEXT, -- Additional context about the scope
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entity_id, entity_type, scope)
);

-- Entity Relationships Table (Enhanced)
-- Tracks relationships between entities with types
CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL,
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('omega_entity', 'character')),
  to_entity_id UUID NOT NULL,
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('omega_entity', 'character')),
  relationship_type TEXT NOT NULL, -- e.g., 'works_for', 'recruits_for', 'vendor_for', 'contractor_for', 'hires_for', 'part_of', 'owns', 'manages'
  scope TEXT, -- Context where this relationship exists
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  evidence_source_ids UUID[], -- IDs of messages/journal entries that support this
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, from_entity_id, from_entity_type, to_entity_id, to_entity_type, relationship_type, scope)
);

-- Entity Scope Groups
-- Groups entities that share the same scope (for clustering)
CREATE TABLE IF NOT EXISTS public.entity_scope_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  scope_context TEXT,
  entity_ids UUID[], -- Array of entity IDs in this scope group
  entity_types TEXT[], -- Parallel array of entity types
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scope, scope_context)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_scopes_user ON public.entity_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_scopes_entity ON public.entity_scopes(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_scopes_scope ON public.entity_scopes(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_user ON public.entity_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_from ON public.entity_relationships(from_entity_id, from_entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_to ON public.entity_relationships(to_entity_id, to_entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_type ON public.entity_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_scope ON public.entity_relationships(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_entity_scope_groups_user ON public.entity_scope_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_scope_groups_scope ON public.entity_scope_groups(user_id, scope);

-- RLS
ALTER TABLE public.entity_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_scope_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity scopes"
  ON public.entity_scopes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity scopes"
  ON public.entity_scopes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity scopes"
  ON public.entity_scopes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own entity relationships"
  ON public.entity_relationships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity relationships"
  ON public.entity_relationships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity relationships"
  ON public.entity_relationships FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own entity scope groups"
  ON public.entity_scope_groups FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity scope groups"
  ON public.entity_scope_groups FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity scope groups"
  ON public.entity_scope_groups FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.entity_scopes IS 'Tracks what context/scope entities belong to (e.g., recruiting, employment, vendor)';
COMMENT ON TABLE public.entity_relationships IS 'Tracks relationships between entities (works_for, recruits_for, vendor_for, etc.)';
COMMENT ON TABLE public.entity_scope_groups IS 'Groups entities that share the same scope for clustering';
COMMENT ON COLUMN public.entity_relationships.relationship_type IS 'Type of relationship: works_for, recruits_for, vendor_for, contractor_for, hires_for, part_of, owns, manages';
COMMENT ON COLUMN public.entity_scopes.scope IS 'Context/scope: recruiting, employment, vendor, family, job_search, etc.';
