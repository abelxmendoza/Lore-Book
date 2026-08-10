-- Organizations foundation tables.
--
-- Historically created outside supabase/migrations (legacy /migrations/G1–G2).
-- Preview branches replay only supabase/migrations, so later ALTER/INDEX
-- statements fail with "relation organizations does not exist". Create the
-- minimal schema here so subsequent migrations can run idempotently.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  type TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  location TEXT,
  founded_date DATE,
  status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  group_type TEXT NOT NULL DEFAULT 'other',
  membership_model TEXT NOT NULL DEFAULT 'strict',
  user_relationship TEXT NOT NULL DEFAULT 'member',
  is_public_entity BOOLEAN NOT NULL DEFAULT false,
  founded_year INT,
  dissolved_year INT,
  importance_score REAL NOT NULL DEFAULT 0,
  root_type TEXT NOT NULL DEFAULT 'GROUP',
  social_category TEXT,
  social_subcategory TEXT,
  parent_group_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  identity_strength_score REAL,
  identity_strength JSONB
);

CREATE INDEX IF NOT EXISTS organizations_user_idx
  ON public.organizations (user_id);
CREATE INDEX IF NOT EXISTS organizations_group_type_idx
  ON public.organizations (group_type);
CREATE INDEX IF NOT EXISTS organizations_user_relationship_idx
  ON public.organizations (user_relationship);
CREATE INDEX IF NOT EXISTS organizations_public_entity_idx
  ON public.organizations (is_public_entity)
  WHERE is_public_entity = true;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_user_isolation'
  ) THEN
    CREATE POLICY organizations_user_isolation ON public.organizations
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  character_id UUID,
  character_name TEXT NOT NULL,
  role TEXT,
  joined_date DATE,
  left_at DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_members_user_org_idx
  ON public.organization_members (user_id, organization_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'organization_members_user_isolation'
  ) THEN
    CREATE POLICY organization_members_user_isolation ON public.organization_members
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.organization_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_rel_no_self_ref CHECK (from_org_id <> to_org_id),
  UNIQUE (user_id, from_org_id, to_org_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS org_rel_from_idx ON public.organization_relationships (from_org_id);
CREATE INDEX IF NOT EXISTS org_rel_to_idx ON public.organization_relationships (to_org_id);
CREATE INDEX IF NOT EXISTS org_rel_user_idx ON public.organization_relationships (user_id);

ALTER TABLE public.organization_relationships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_relationships'
      AND policyname = 'org_relationships_user_isolation'
  ) THEN
    CREATE POLICY org_relationships_user_isolation ON public.organization_relationships
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.group_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_name TEXT,
  detected_members TEXT[] NOT NULL DEFAULT '{}',
  suggested_group_type TEXT NOT NULL DEFAULT 'friend_group',
  suggested_user_relationship TEXT NOT NULL DEFAULT 'member',
  suggested_membership_model TEXT NOT NULL DEFAULT 'strict',
  is_public_entity BOOLEAN NOT NULL DEFAULT false,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.65,
  occurrence_count INT NOT NULL DEFAULT 1,
  source_message_ids UUID[] NOT NULL DEFAULT '{}',
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_candidates_user_idx
  ON public.group_candidates (user_id);
CREATE INDEX IF NOT EXISTS group_candidates_status_idx
  ON public.group_candidates (user_id, status)
  WHERE status = 'pending';

ALTER TABLE public.group_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_candidates'
      AND policyname = 'group_candidates_user_isolation'
  ) THEN
    CREATE POLICY group_candidates_user_isolation ON public.group_candidates
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Lightweight companion tables referenced by organizationService list paths.
CREATE TABLE IF NOT EXISTS public.organization_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  memory_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  date DATE,
  related_member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID,
  title TEXT NOT NULL,
  date DATE,
  type TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id UUID,
  location_name TEXT NOT NULL,
  visit_count INT NOT NULL DEFAULT 0,
  last_visited TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
