/** Canonical G1 group types — keep in sync with DB CHECK constraints. */
export const CANONICAL_GROUP_TYPES = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit',
  'family', 'household', 'martial_arts', 'scene', 'crew', 'collective', 'community',
  'institution', 'public_entity', 'brand', 'vendor', 'team', 'project', 'event_group', 'software', 'other',
] as const;

export type CanonicalGroupType = (typeof CANONICAL_GROUP_TYPES)[number];

/**
 * Named orgs / products can exist without a Character-book roster.
 * Social clusters (friend group, band, household, …) still need two people.
 */
export const ROSTER_OPTIONAL_GROUP_TYPES: ReadonlySet<CanonicalGroupType> = new Set([
  'company',
  'brand',
  'vendor',
  'public_entity',
  'institution',
  'software',
  'nonprofit',
  'project',
  'team',
  'event_group',
  'other',
]);

export const GROUP_CANDIDATE_ROSTER_REQUIRED =
  'This kind of group needs at least two people already in your Character book. Add them first, or change the type to Company if this is a workplace.';

export function requiresConfirmedRoster(input: {
  isPublicEntity?: boolean | null;
  groupType?: string | null;
}): boolean {
  if (input.isPublicEntity) return false;
  const groupType = input.groupType;
  if (groupType && ROSTER_OPTIONAL_GROUP_TYPES.has(groupType as CanonicalGroupType)) {
    return false;
  }
  return true;
}
