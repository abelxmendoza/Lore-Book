/** Canonical G1 group types — keep in sync with DB CHECK constraints. */
export const CANONICAL_GROUP_TYPES = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit',
  'family', 'household', 'martial_arts', 'scene', 'crew', 'collective', 'community',
  'institution', 'public_entity', 'brand', 'vendor', 'team', 'project', 'event_group', 'other',
] as const;

export type CanonicalGroupType = (typeof CANONICAL_GROUP_TYPES)[number];
