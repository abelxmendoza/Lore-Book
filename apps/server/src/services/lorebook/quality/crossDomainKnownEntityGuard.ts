/**
 * Reject entities known in the wrong LoreBook domain.
 */

import { guardCrossBookEntity } from '../../lexical/projects/projectCrossBookGuard';
import type { CrossBookIndex } from '../../lexical/projects/projectSuggestionTypes';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type {
  EntityQualityCandidate,
  EntityQualityContext,
  EntityQualityDomain,
  EntityQualityVerdict,
} from './entityQualityGuardTypes';

const SPAN_TO_DOMAIN: Record<string, EntityQualityDomain> = {
  PERSON: 'characters',
  CHARACTER: 'characters',
  PLACE: 'locations',
  VENUE: 'locations',
  ORGANIZATION: 'organizations',
  GROUP: 'groups',
  SKILL: 'skills',
  EVENT: 'events',
  TASK: 'quests',
};

const DOMAIN_TO_REJECTED: Partial<Record<EntityQualityDomain, EntityQualityDomain>> = {
  projects: 'characters',
};

function mapRejectedAs(rejectedAs?: string): EntityQualityDomain | undefined {
  if (!rejectedAs) return undefined;
  return SPAN_TO_DOMAIN[rejectedAs];
}

export function guardCrossDomainKnownEntity(
  candidate: EntityQualityCandidate,
  ctx: EntityQualityContext
): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  const contextText = [candidate.contextText, candidate.evidence].filter(Boolean).join(' ');
  const index = ctx.crossBook;
  if (!index) return null;

  const guard = guardCrossBookEntity(name, contextText, index);
  if (guard.allowed) return null;

  const redirectDomain = mapRejectedAs(guard.rejectedAs);
  if (!redirectDomain) return null;

  if (redirectDomain === candidate.domain) return null;

  return {
    gate: 'reject',
    name,
    domain: candidate.domain,
    redirectDomain,
    rejectionReason: guard.rejectionReason ?? `known_in_${redirectDomain}`,
    confidence: 0.9,
    provenance: [
      {
        guard: 'crossDomainKnownEntityGuard',
        rule: guard.rejectionReason ?? 'cross_book_conflict',
        detail: guard.rejectedAs,
      },
    ],
    requiresReview: false,
  };
}

/** Block project/place cards when canon already owns the identity elsewhere. */
export function guardWrongBookPlacement(
  candidate: EntityQualityCandidate,
  ctx: EntityQualityContext
): EntityQualityVerdict | null {
  if (candidate.domain !== 'projects' && candidate.domain !== 'events') return null;
  const index = ctx.crossBook;
  if (!index) return null;

  const key = normalizeNameKey(candidate.name);
  for (const known of index.characters) {
    if (normalizeNameKey(known) === key) {
      return {
        gate: 'reject',
        name: candidate.name,
        domain: candidate.domain,
        redirectDomain: 'characters',
        rejectionReason: 'known_as_person',
        confidence: 1,
        provenance: [{ guard: 'crossDomainKnownEntityGuard', rule: 'known_as_person' }],
        requiresReview: false,
      };
    }
  }
  return null;
}

export function buildEmptyCrossBookIndex(): CrossBookIndex {
  return {
    characters: new Set(),
    places: new Set(),
    organizations: new Set(),
    groups: new Set(),
    skills: new Set(),
    events: new Set(),
    glossaryAliases: new Set(),
  };
}
