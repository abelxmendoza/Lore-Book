/**
 * Book-level "stance" buckets for Groups & Organizations.
 * Rolls up fine-grained `user_relationship` + roster signals into a simple lens:
 * Mine / Close to / Their world / Mentioned.
 */

import type { Organization, UserRelationship } from '../components/organizations/OrganizationProfileCard';

export type OrganizationStance = 'mine' | 'close_to' | 'their_world' | 'mentioned';

export const ORGANIZATION_STANCES: OrganizationStance[] = [
  'mine',
  'close_to',
  'their_world',
  'mentioned',
];

export const ORGANIZATION_STANCE_LABELS: Record<OrganizationStance, string> = {
  mine: 'Mine',
  close_to: 'Close to',
  their_world: 'Their world',
  mentioned: 'Mentioned',
};

export const ORGANIZATION_STANCE_HINTS: Record<OrganizationStance, string> = {
  mine: 'Groups you belong to (or used to).',
  close_to: 'Not on the roster, but tied to people or scenes near you.',
  their_world: 'Groups your people are in that you are not.',
  mentioned: 'Background lore — mentioned, no real affiliation yet.',
};

const MINE_RELS = new Set<UserRelationship>([
  'founder',
  'leader',
  'member',
  'alumnus',
  'former_member',
]);

const CLOSE_RELS = new Set<UserRelationship>(['adjacent', 'collaborator']);

function linkedCharacterCount(org: Organization): number {
  return (org.members ?? []).filter((m) => Boolean(m.character_id)).length;
}

function rosterPeopleCount(org: Organization): number {
  const fromMembers = org.members?.length ?? 0;
  if (fromMembers > 0) return fromMembers;
  return org.member_count ?? 0;
}

/** Resolve which stance bucket an organization belongs in. */
export function resolveOrganizationStance(org: Organization): OrganizationStance {
  const rel = org.user_relationship;

  if (rel && MINE_RELS.has(rel)) return 'mine';
  if (rel && CLOSE_RELS.has(rel)) return 'close_to';

  const linked = linkedCharacterCount(org);
  const roster = rosterPeopleCount(org);

  // People you know (or at least a named roster) without you being a member.
  if (linked > 0 || (roster > 0 && !org.is_public_entity)) return 'their_world';

  return 'mentioned';
}

export function organizationMatchesStance(
  org: Organization,
  stance: OrganizationStance | 'all',
): boolean {
  if (stance === 'all') return true;
  return resolveOrganizationStance(org) === stance;
}

export function countOrganizationsByStance(
  orgs: Organization[],
): Record<OrganizationStance | 'all', number> {
  const counts: Record<OrganizationStance | 'all', number> = {
    all: orgs.length,
    mine: 0,
    close_to: 0,
    their_world: 0,
    mentioned: 0,
  };
  for (const org of orgs) {
    counts[resolveOrganizationStance(org)] += 1;
  }
  return counts;
}
