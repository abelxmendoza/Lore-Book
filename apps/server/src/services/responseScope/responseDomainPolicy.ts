/**
 * Domain routing policy — which memory domains may inform an answer for a
 * given question intent, and which are hard-blocked.
 */

import type { LoreBookDomain, ScopeIntent } from './responseScopeTypes';

/** Domains that must NEVER render inside normal chat, regardless of intent. */
export const NEVER_IN_CHAT: LoreBookDomain[] = ['diagnostics', 'character_audit', 'full_graph'];

type DomainPolicy = { allowed: LoreBookDomain[]; blocked: LoreBookDomain[] };

const POLICIES: Record<ScopeIntent, DomainPolicy> = {
  work: {
    allowed: [
      'people',
      'organizations',
      'work_roles',
      'teams',
      'work_relationships',
      'current_work_timeline',
      'projects',
    ],
    blocked: [
      'family',
      'romance',
      'music_scene',
      'general_biography',
      'unrelated_projects',
      'private_residences',
      'quest_log',
      ...NEVER_IN_CHAT,
    ],
  },
  family: {
    allowed: ['people', 'family', 'places', 'events'],
    blocked: ['work_roles', 'teams', 'work_relationships', 'romance', 'music_scene', 'quest_log', ...NEVER_IN_CHAT],
  },
  relationship: {
    allowed: ['people', 'romance', 'events', 'places'],
    blocked: ['work_roles', 'teams', 'work_relationships', 'family', 'quest_log', ...NEVER_IN_CHAT],
  },
  project: {
    allowed: ['projects', 'people', 'organizations', 'events', 'current_work_timeline'],
    blocked: ['family', 'romance', 'music_scene', 'private_residences', ...NEVER_IN_CHAT],
  },
  place: {
    allowed: ['places', 'events', 'people'],
    blocked: ['work_roles', 'romance', 'family', 'quest_log', ...NEVER_IN_CHAT],
  },
  event: {
    allowed: ['events', 'people', 'places', 'organizations', 'music_scene'],
    blocked: ['work_roles', 'romance', 'quest_log', ...NEVER_IN_CHAT],
  },
  biography: {
    allowed: ['general_biography', 'people', 'places', 'events', 'projects'],
    blocked: [...NEVER_IN_CHAT],
  },
  general: {
    allowed: [
      'people',
      'places',
      'events',
      'projects',
      'organizations',
      'general_biography',
      'family',
      'music_scene',
    ],
    blocked: ['romance', ...NEVER_IN_CHAT],
  },
};

export function domainPolicyFor(intent: ScopeIntent): DomainPolicy {
  return POLICIES[intent] ?? POLICIES.general;
}

export function isDomainAllowed(domain: LoreBookDomain, intent: ScopeIntent): boolean {
  const policy = domainPolicyFor(intent);
  if (policy.blocked.includes(domain)) return false;
  return policy.allowed.includes(domain);
}
