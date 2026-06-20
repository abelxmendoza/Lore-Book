/**
 * Possessive residence handling — reject orphaned "'s House", flag privacy-sensitive homes.
 */

import { formatPossessivePlace } from '../../../utils/namedPlaceExtractor';
import { normalizeNameKey } from '../../../utils/nameNormalization';

export type PrivateResidenceAnalysis = {
  displayName: string;
  ownerDisplayName: string;
  placeType: 'private_residence' | 'family_home';
  privacySensitive: true;
  requiresReview: true;
  rulesFired: string[];
};

const ORPHAN_POSSESSIVE = /^'?s\s+(house|home|apartment|condo|casa|place)\b/i;

const POSSESSIVE_RESIDENCE =
  /\b((?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2}?'s)\s+(house|home|apartment|condo|casa|place)\b/i;

const FAMILY_OWNER =
  /^(mom|mother|dad|father|abuela|abuelo|grandma|grandpa|tio|tía|tia|aunt|uncle|cousin|mama|papa|nana|nona)/i;

export function isOrphanPossessiveResidence(span: string): boolean {
  return ORPHAN_POSSESSIVE.test(span.trim()) || normalizeNameKey(span).startsWith('s house');
}

export function analyzePrivateResidence(span: string): PrivateResidenceAnalysis | null {
  const trimmed = span.trim();
  if (isOrphanPossessiveResidence(trimmed)) return null;

  const match = POSSESSIVE_RESIDENCE.exec(trimmed);
  if (!match) return null;

  const ownerRaw = match[1];
  const placeTypeRaw = match[2];
  const ownerDisplayName = ownerRaw
    .replace(/(?:'s|s)$/i, '')
    .replace(/^(?:my|our|the)\s+/i, '')
    .trim();
  if (!ownerDisplayName || ownerDisplayName.length < 2) return null;

  const displayName = formatPossessivePlace(ownerRaw, placeTypeRaw);
  const isFamily = FAMILY_OWNER.test(ownerDisplayName);

  return {
    displayName,
    ownerDisplayName,
    placeType: isFamily ? 'family_home' : 'private_residence',
    privacySensitive: true,
    requiresReview: true,
    rulesFired: isFamily ? ['family_home', 'privacy_sensitive'] : ['private_residence', 'privacy_sensitive'],
  };
}
