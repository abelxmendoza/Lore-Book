/**
 * Romantic-partner eligibility guards.
 *
 * Reverse-engineered from real mis-extractions in Love & Relationships:
 *   - "Ex Lover" (a band) and bare role labels were stored as romantic partners
 *     because they pass generic person-name validation.
 *   - "Juan" was stored as the user's ex_lover when the evidence actually says
 *     "her boyfriend Juan" — i.e. he is someone ELSE's partner.
 *
 * These are deterministic, LLM-free checks applied before a romantic
 * relationship is created so the same junk can't reappear. They intentionally
 * do not try to catch things with no signal in the data (e.g. a musician whose
 * stage name looks like a person) — those are left to dedupe/review.
 */

import { isIndividualPersonName } from '../../utils/personNameValidation';
import { looksLikeMusicAct } from '../entities/musicActDetection';

/** Relationship role labels that are not a person's name. */
const RELATIONSHIP_ROLE_LABELS = new Set([
  'ex',
  'ex lover',
  'exlover',
  'ex boyfriend',
  'ex girlfriend',
  'ex partner',
  'lover',
  'crush',
  'situationship',
  'fling',
  'hookup',
  'hook up',
  'boyfriend',
  'girlfriend',
  'partner',
  'date',
  'my ex',
  'the ex',
  'baby',
  'bae',
  'boo',
]);

/**
 * Evidence cues that the named person belongs to someone else (so they are not
 * the user's romantic partner): "her boyfriend", "is taken", "has a girlfriend".
 */
const THIRD_PARTY_PARTNER_PATTERNS: RegExp[] = [
  /\b(?:her|his|their)\s+(?:boyfriend|girlfriend|partner|husband|wife|man|woman|boo|bf|gf|fiancé|fiance|fiancée)\b/i,
  /\b(?:has|had|have)\s+a\s+(?:boyfriend|girlfriend|partner|husband|wife|man)\b/i,
  /\b(?:is|was|are|were)\s+taken\b/i,
  /\bshe(?:'s|s| is| was)\s+taken\b/i,
  /\bhe(?:'s|s| is| was)\s+taken\b/i,
  /\b(?:already\s+)?(?:married|engaged)\s+to\s+(?!me\b)/i,
];

export function normalizeRoleLabel(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the "name" is a relationship role label rather than a person. */
export function isRelationshipRoleLabel(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return false;
  return RELATIONSHIP_ROLE_LABELS.has(normalizeRoleLabel(name));
}

/** True when the evidence indicates the person is someone else's partner. */
export function hasThirdPartyPartnerCue(evidence: string | null | undefined): boolean {
  if (!evidence || !evidence.trim()) return false;
  return THIRD_PARTY_PARTNER_PATTERNS.some((re) => re.test(evidence));
}

export type RomanticEligibility = { eligible: boolean; reason?: string };

/**
 * Decide whether a detected romantic partner should be stored as one of the
 * user's romantic relationships.
 *
 * Pass `knownOrganizationNames` (the user's Groups & Organizations book) to make
 * this consistent with what the app already knows: a romantic signal that is
 * really a band/org name ("Ex Lover", "Lover", "Crush") must not romance the
 * org's members.
 */
export function assessRomanticPartnerEligibility(input: {
  name?: string | null;
  evidence?: string | null;
  knownOrganizationNames?: Iterable<string> | null;
}): RomanticEligibility {
  const name = input.name?.trim() ?? '';

  if (name && isRelationshipRoleLabel(name)) {
    return { eligible: false, reason: 'role_label_not_a_person' };
  }
  if (name && !isIndividualPersonName(name)) {
    return { eligible: false, reason: 'not_an_individual_person' };
  }
  if (looksLikeMusicAct(name, input.evidence).isMusicAct) {
    return { eligible: false, reason: 'music_act' };
  }
  if (hasThirdPartyPartnerCue(input.evidence)) {
    return { eligible: false, reason: 'third_party_partner' };
  }

  // ── Cross-reference the Groups & Organizations book ──────────────────────
  const orgLabels = [...(input.knownOrganizationNames ?? [])]
    .map(normalizeRoleLabel)
    .filter(Boolean);
  if (orgLabels.length > 0) {
    const orgSet = new Set(orgLabels);
    const nameKey = normalizeRoleLabel(name);
    // The "partner" is actually one of the user's organizations/bands.
    if (nameKey && orgSet.has(nameKey)) {
      return { eligible: false, reason: 'partner_is_known_organization' };
    }
    // The romantic cue came from a band name that doubles as a relationship word
    // (the band "Ex Lover" in the evidence → not a real "ex lover" of this person).
    const evidenceKey = normalizeRoleLabel(input.evidence ?? '');
    for (const org of orgSet) {
      if (RELATIONSHIP_ROLE_LABELS.has(org) && evidenceKey.split(' ').length > 0 && ` ${evidenceKey} `.includes(` ${org} `)) {
        return { eligible: false, reason: 'role_cue_is_known_organization' };
      }
    }
  }

  return { eligible: true };
}
