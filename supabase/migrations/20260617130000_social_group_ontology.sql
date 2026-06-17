-- Social group ontology columns for Organizations Book knowledge graph.
-- Classifies groups into family/household/community/company/etc.
-- Households nest under families via parent_group_id.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS root_type TEXT NOT NULL DEFAULT 'GROUP',
  ADD COLUMN IF NOT EXISTS social_category TEXT,
  ADD COLUMN IF NOT EXISTS social_subcategory TEXT,
  ADD COLUMN IF NOT EXISTS parent_group_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_parent_group
  ON public.organizations(parent_group_id)
  WHERE parent_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_social_category
  ON public.organizations(user_id, social_category);

-- Extend group_type to include household, team, project, event_group
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_group_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_group_type_check
    CHECK (group_type IN (
      'friend_group','band','sports_team','company','club','nonprofit',
      'family','household','martial_arts','scene','crew','collective',
      'community','institution','public_entity','brand','vendor',
      'team','project','event_group','other'
    ));

COMMENT ON COLUMN public.organizations.root_type IS 'GROUP — canonical social entity root';
COMMENT ON COLUMN public.organizations.social_category IS 'COMPANY, INSTITUTION, COMMUNITY, SCENE, FAMILY, HOUSEHOLD, TEAM, BAND, EVENT_GROUP, FRIEND_GROUP, PROJECT, UNKNOWN';
COMMENT ON COLUMN public.organizations.social_subcategory IS 'Finer grain: STAFFING, BOOTCAMP, GOTH_SCENE, etc.';
COMMENT ON COLUMN public.organizations.parent_group_id IS 'Households and sub-teams link to parent family/community';
