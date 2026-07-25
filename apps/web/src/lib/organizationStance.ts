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

/**
 * Timeline voice for a group — lane labels & copy follow Our relationship stance
 * (Mine / Close to / Their world / Mentioned), not a one-size membership frame.
 */
export type OrganizationTimelineVoice = {
  stance: OrganizationStance;
  stanceLabel: string;
  stanceHint: string;
  title: string;
  description: string;
  withLabel: string;
  withoutLabel: string;
  withHint: string;
  withoutHint: string;
  withCountLabel: string;
  withoutCountLabel: string;
  emptyTitle: string;
  emptyHint: string;
  /** List-row badge when audience is with_user */
  withBadge: string;
  /** List-row badge when audience is without_user */
  withoutBadge: string;
};

export function getOrganizationTimelineVoice(org: Organization): OrganizationTimelineVoice {
  const stance = resolveOrganizationStance(org);
  const name = org.name?.trim() || 'this group';
  const stanceLabel = ORGANIZATION_STANCE_LABELS[stance];
  const stanceHint = ORGANIZATION_STANCE_HINTS[stance];
  const title = `${name} Timeline`;

  if (stance === 'mine') {
    return {
      stance,
      stanceLabel,
      stanceHint,
      title,
      description: `Events you were part of with ${name}, and things ${name} went through without you.`,
      withLabel: 'With you',
      withoutLabel: 'Without you',
      withHint: `You were there with ${name}`,
      withoutHint: `${name} when you weren't there — including group-wide moments`,
      withCountLabel: 'with you',
      withoutCountLabel: 'without you',
      emptyTitle: `No timeline events for ${name} yet`,
      emptyHint: `As you mention ${name} in your conversations, shared moments and group story will appear here.`,
      withBadge: 'With you',
      withoutBadge: 'Without you',
    };
  }

  if (stance === 'close_to') {
    return {
      stance,
      stanceLabel,
      stanceHint,
      title,
      description: `Moments you crossed paths with ${name}, and what happened in their orbit without you.`,
      withLabel: 'With you',
      withoutLabel: 'Their orbit',
      withHint: `You were present around ${name}`,
      withoutHint: `${name} activity near you that you weren't in`,
      withCountLabel: 'with you',
      withoutCountLabel: 'their orbit',
      emptyTitle: `No timeline yet for ${name}`,
      emptyHint: `As ${name} shows up near people or scenes in your life, moments will plot here.`,
      withBadge: 'With you',
      withoutBadge: 'Their orbit',
    };
  }

  if (stance === 'their_world') {
    return {
      stance,
      stanceLabel,
      stanceHint,
      title,
      description: `What you've learned about ${name} — rare crossovers with you, mostly their world without you.`,
      withLabel: 'Crossed paths',
      withoutLabel: 'Their world',
      withHint: `Rare times you were around ${name}`,
      withoutHint: `${name}'s life through people you know — you weren't part of it`,
      withCountLabel: 'crossed paths',
      withoutCountLabel: 'their world',
      emptyTitle: `No story yet for ${name}`,
      emptyHint: `As people you know bring up ${name}, their group story will appear here.`,
      withBadge: 'Crossed paths',
      withoutBadge: 'Their world',
    };
  }

  // mentioned
  return {
    stance,
    stanceLabel,
    stanceHint,
    title,
    description: `Where ${name} came up in your story — background lore, not a group you belong to.`,
    withLabel: 'In your story',
    withoutLabel: 'Background',
    withHint: `You were in the moment when ${name} came up`,
    withoutHint: `Lore about ${name} without you in the scene`,
    withCountLabel: 'in your story',
    withoutCountLabel: 'background',
    emptyTitle: `No mentions of ${name} on a timeline yet`,
    emptyHint: `When ${name} shows up in chat as background lore, those moments will collect here.`,
    withBadge: 'In your story',
    withoutBadge: 'Background',
  };
}
