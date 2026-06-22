import { normalizeNameKey } from '../../../utils/nameNormalization';

export type MediaDisambiguationResult =
  | { route: 'event'; displayName: string; reason: string }
  | { route: 'venue'; displayName: string; reason: string }
  | { route: 'organization'; displayName: string; reason: string }
  | { route: 'reject_media'; displayName: string; reason: string }
  | null;

const EVENT_NAMES = [
  { pattern: /\bSka Prom\b/i, displayName: 'Ska Prom' },
  { pattern: /\bGothicumbia\b/i, displayName: 'Gothicumbia' },
  { pattern: /\bCode Red\b/i, displayName: 'Code Red', reviewFirst: true },
];

const VENUE_NAMES = [{ pattern: /\bBad Dogg Compound\b/i, displayName: 'Bad Dogg Compound' }];

export function disambiguateEventOrVenue(text: string): MediaDisambiguationResult {
  for (const { pattern, displayName } of VENUE_NAMES) {
    if (pattern.test(text)) {
      return { route: 'venue', displayName, reason: 'venue_not_media' };
    }
  }

  for (const entry of EVENT_NAMES) {
    if (!entry.pattern.test(text)) continue;
    return {
      route: 'event',
      displayName: entry.displayName,
      reason: 'event_not_media',
    };
  }

  if (/\bClever Programmer Bootcamp\b/i.test(text)) {
    return { route: 'organization', displayName: 'Clever Programmer Bootcamp', reason: 'education_org_not_media' };
  }

  return null;
}

export function shouldRejectAsMedia(
  displayName: string,
  text: string,
  knownDomains?: Record<string, string>,
): MediaDisambiguationResult | null {
  const disambiguation = disambiguateEventOrVenue(text);
  if (disambiguation && normalizeNameKey(disambiguation.displayName) === normalizeNameKey(displayName)) {
    return { route: 'reject_media', displayName, reason: disambiguation.reason };
  }

  const key = normalizeNameKey(displayName);
  if (knownDomains?.[key] === 'person' || knownDomains?.[key] === 'place' || knownDomains?.[key] === 'event') {
    return { route: 'reject_media', displayName, reason: `known_${knownDomains[key]}_entity` };
  }

  if (knownDomains?.[key] === 'project') {
    return { route: 'reject_media', displayName, reason: 'known_project_entity' };
  }

  if (knownDomains?.[key] === 'organization') {
    return { route: 'reject_media', displayName, reason: 'known_organization_entity' };
  }

  return null;
}

export function isCodeRedReviewFirst(text: string): boolean {
  return /\bCode Red\b/i.test(text);
}
