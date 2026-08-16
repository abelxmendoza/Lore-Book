-- Add 'software' as a canonical group_type (dev tools / AI tools / IDEs — see
-- apps/web/src/lib/groupTypes.ts GROUP_SUBCATEGORIES.software for finer typing
-- via organizations.metadata.subcategory). Previously these fell through
-- classification into 'company' or 'other'.
--
-- Also brings group_candidates.suggested_group_type's CHECK constraint back in
-- sync with organizations.group_type's — it was missing several values already
-- produced by groupDetectionService.suggestGroupType() (community, vendor,
-- household, brand, team, project, event_group), which is additive and safe
-- to widen alongside this change.
--
-- NOTE: written for review only — not applied in this session.

ALTER TABLE public.organizations
  DROP CONSTRAINT organizations_group_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_group_type_check CHECK (
    group_type = ANY (ARRAY[
      'friend_group'::text, 'band'::text, 'sports_team'::text, 'company'::text,
      'club'::text, 'nonprofit'::text, 'family'::text, 'household'::text,
      'martial_arts'::text, 'scene'::text, 'crew'::text, 'collective'::text,
      'community'::text, 'institution'::text, 'public_entity'::text, 'brand'::text,
      'vendor'::text, 'team'::text, 'project'::text, 'event_group'::text,
      'care_team'::text, 'support_network'::text, 'software'::text, 'other'::text
    ])
  );

ALTER TABLE public.group_candidates
  DROP CONSTRAINT group_candidates_group_type_check;

ALTER TABLE public.group_candidates
  ADD CONSTRAINT group_candidates_group_type_check CHECK (
    suggested_group_type = ANY (ARRAY[
      'friend_group'::text, 'band'::text, 'sports_team'::text, 'company'::text,
      'club'::text, 'nonprofit'::text, 'family'::text, 'household'::text,
      'martial_arts'::text, 'scene'::text, 'crew'::text, 'collective'::text,
      'community'::text, 'institution'::text, 'public_entity'::text, 'brand'::text,
      'vendor'::text, 'team'::text, 'project'::text, 'event_group'::text,
      'care_team'::text, 'support_network'::text, 'software'::text, 'other'::text
    ])
  );
