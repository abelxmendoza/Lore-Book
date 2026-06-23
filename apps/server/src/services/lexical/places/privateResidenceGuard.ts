/**
 * Possessive residence handling — reject orphaned "'s House", flag privacy-sensitive homes.
 */

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
  /\b((?:my\s+|our\s+|the\s+)?(?:Tio|Tía|Tia|Mr|Mrs|Ms|Dr|Professor|Prof)\.?\s+[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?'?s|(?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2}?'s|(?:my\s+|our\s+|the\s+)?(?:mom|mother|dad|father|abuela|abuelo|grandma|grandpa|moms|dads|abuelas|abuelos|tios|tias))\s+(house|home|apartment|condo|casa|place|office|clinic)\b/i;

const FAMILY_OWNER =
  /^(mom|mother|dad|father|abuela|abuelo|grandma|grandpa|tio|tía|tia|aunt|uncle|cousin|mama|papa|nana|nona)/i;

function titleCasePhrase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^dr\.?$/i.test(word)) return 'Dr.';
      if (/^prof\.?$/i.test(word)) return 'Professor';
      if (/^t[ií]a$/i.test(word)) return 'Tía';
      if (/^tio$/i.test(word)) return 'Tio';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatResidence(ownerDisplayName: string, placeType: string): string {
  const typeKey = placeType.toLowerCase();
  const typeLabel = typeKey === 'home' || typeKey === 'casa' ? 'House' : titleCasePhrase(typeKey);
  return `${ownerDisplayName}'s ${typeLabel}`;
}

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
    .replace(/\bprof\.?\b/i, 'Professor')
    .replace(/\bdr\.?\b/i, 'Dr.')
    .trim();
  if (!ownerDisplayName || ownerDisplayName.length < 2) return null;

  const displayName = formatResidence(titleCasePhrase(ownerDisplayName), placeTypeRaw);
  const isFamily = FAMILY_OWNER.test(ownerDisplayName);

  return {
    displayName,
    ownerDisplayName,
    placeType: 'private_residence',
    privacySensitive: true,
    requiresReview: true,
    rulesFired: isFamily ? ['family_home', 'privacy_sensitive'] : ['private_residence', 'privacy_sensitive'],
  };
}
