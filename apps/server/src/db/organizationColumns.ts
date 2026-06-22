/**
 * Explicit column lists for organization read paths — avoids `select('*')` egress
 * regressions and omits audit columns (user_id, created_at, updated_at) on nested
 * org tables when assembling list/detail views (not needed by API consumers).
 *
 * Keep in sync with public.organizations* tables when columns are added.
 */
export const ORG_COLS =
  'id, user_id, name, aliases, type, description, location, founded_date, status, metadata, ' +
  'created_at, updated_at, group_type, membership_model, user_relationship, is_public_entity, ' +
  'founded_year, dissolved_year, importance_score, root_type, social_category, social_subcategory, ' +
  'parent_group_id, identity_strength_score, identity_strength';

/** Fields consumed by OrganizationMember on list/detail cards. */
export const ORG_MEMBER_COLS =
  'id, organization_id, character_id, character_name, role, joined_date, left_at, status, notes';

export const ORG_STORY_COLS =
  'id, organization_id, memory_id, title, summary, date, related_member_ids';

export const ORG_EVENT_COLS = 'id, organization_id, event_id, title, date, type';

export const ORG_LOCATION_COLS =
  'id, organization_id, location_id, location_name, visit_count, last_visited';

/** Tables touched by listOrganizations (for egress architecture guards). */
export const ORG_LIST_TABLES = [
  'organizations',
  'organization_members',
  'organization_stories',
  'organization_events',
  'organization_locations',
] as const;

export const ORG_LIST_SELECT_BY_TABLE: Record<(typeof ORG_LIST_TABLES)[number], string> = {
  organizations: ORG_COLS,
  organization_members: ORG_MEMBER_COLS,
  organization_stories: ORG_STORY_COLS,
  organization_events: ORG_EVENT_COLS,
  organization_locations: ORG_LOCATION_COLS,
};
