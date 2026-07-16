-- =====================================================
-- GROUP RELATIONSHIPS
-- Purpose: Track relationships between groups/communities (hierarchies, affiliations, evolution)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enhanced Groups Table (if not already enhanced)
-- Add columns to existing social_communities if needed
DO $$
BEGIN
  -- Add group attributes if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_communities' AND column_name = 'group_type'
  ) THEN
    ALTER TABLE public.social_communities 
    ADD COLUMN group_type TEXT CHECK (group_type IN ('family', 'work', 'school', 'hobby', 'social', 'online', 'offline', 'mixed')),
    ADD COLUMN purpose TEXT,
    ADD COLUMN location TEXT,
    ADD COLUMN frequency TEXT,
    ADD COLUMN founded_date TIMESTAMPTZ,
    ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dissolved', 'merged')),
    ADD COLUMN hierarchy_level INT DEFAULT 0,
    ADD COLUMN parent_group_id UUID REFERENCES public.social_communities(id);
  END IF;
END $$;

-- Group Relationships Table
CREATE TABLE IF NOT EXISTS public.group_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_group_id UUID NOT NULL REFERENCES public.social_communities(id) ON DELETE CASCADE,
  to_group_id UUID NOT NULL REFERENCES public.social_communities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'parent_group_of',      -- Group A contains Group B
    'subgroup_of',          -- Group B is part of Group A
    'chapter_of',           -- Group B is chapter of Group A
    'branch_of',            -- Group B is branch of Group A
    'affiliated_with',      -- Groups with shared interests
    'partner_of',           -- Groups that collaborate
    'competitor_of',        -- Competing groups
    'merged_with',          -- Groups that merged
    'split_from',           -- Group split from another
    'succeeded_by',         -- Group succeeded by another
    'overlaps_with',        -- Groups with shared members
    'exclusive_with',       -- Groups with no shared members
    'recruits_from',        -- Group A recruits from Group B
    'evolved_from',         -- Group evolved from another
    'replaced_by',          -- Group replaced by another
    'predecessor_of'        -- Group came before another
  )),
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  evidence_source_ids UUID[], -- IDs of messages/journal entries that support this
  start_time TIMESTAMPTZ, -- When relationship started
  end_time TIMESTAMPTZ,   -- When relationship ended (if applicable)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, from_group_id, to_group_id, relationship_type)
);

-- Group Evolution Timeline
CREATE TABLE IF NOT EXISTS public.group_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.social_communities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'formed', 'merged', 'split', 'dissolved', 'renamed', 'purpose_changed', 
    'location_changed', 'member_added', 'member_removed', 'status_changed'
  )),
  event_description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  previous_state JSONB, -- Snapshot of group before event
  new_state JSONB,      -- Snapshot of group after event
  evidence_source_ids UUID[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_relationships_user ON public.group_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_relationships_from ON public.group_relationships(from_group_id);
CREATE INDEX IF NOT EXISTS idx_group_relationships_to ON public.group_relationships(to_group_id);
CREATE INDEX IF NOT EXISTS idx_group_relationships_type ON public.group_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_group_evolution_user ON public.group_evolution(user_id);
CREATE INDEX IF NOT EXISTS idx_group_evolution_group ON public.group_evolution(group_id);
CREATE INDEX IF NOT EXISTS idx_group_evolution_date ON public.group_evolution(event_date);

-- RLS
ALTER TABLE public.group_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_evolution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own group relationships"
  ON public.group_relationships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own group relationships"
  ON public.group_relationships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own group relationships"
  ON public.group_relationships FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own group relationships"
  ON public.group_relationships FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own group evolution"
  ON public.group_evolution FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own group evolution"
  ON public.group_evolution FOR INSERT
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.group_relationships IS 'Tracks relationships between groups (hierarchies, affiliations, evolution)';
COMMENT ON TABLE public.group_evolution IS 'Tracks evolution of groups over time (formed, merged, split, etc.)';
