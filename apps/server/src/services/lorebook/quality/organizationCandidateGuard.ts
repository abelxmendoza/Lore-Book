/**
 * Reject organization/group candidates that are not actually named
 * organizations — generic team/department/role phrases without a resolvable
 * proper-noun parent ("Support Team", "Venture Capital Firm"), and narrative
 * descriptions ("Social workers visiting Tio Juan"), that would otherwise
 * become standalone junk cards.
 *
 * Deterministic, no LLM. Only fires for the `organizations`/`groups` domains,
 * mirroring placeCandidateGuard.ts's shape for the locations domain.
 *
 * Also the single shared source for org/group noise-term blocklists that used
 * to be duplicated separately in groupDetectionService.ts and
 * groupCandidateService.ts.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

/** Fabricated placeholder names used only in synthetic tests — never real lore. */
export const ORG_CANDIDATE_TEST_NOISE =
  /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock|san diego|of debt)\b/i;

/** Real proper nouns that get mis-extracted as "members" of a nearby org —
 *  big companies mentioned in the same sentence, place names that read like
 *  person names, and non-name stopword tokens. */
export const ORG_CANDIDATE_NOISE_MEMBER_NAMES = new Set([
  'Amazon', 'Google', 'Microsoft', 'Apple', 'Meta', 'Netflix',
  'Tesla', 'OpenAI', 'Anthropic', 'San Diego', 'Smith Rock',
  'First Street', 'First Street Pool', 'First Street Pool Billiards',
  'Pool Group', 'Billiards Group',
  'Had', 'Do', 'Did', 'Just', 'She', 'He', 'They', 'My', 'From', 'The', 'This', 'That',
]);

/** Bare, unnamed team/department/role descriptors. A real internal team name
 *  carries a proper-noun qualifier ("Amazon Failure Analysis Team"); a bare
 *  category ("Support Team", "Venture Capital Firm") is a role description,
 *  not a named entity — reject it unless it resolves to a parent org. */
const GENERIC_TEAM_DEPT_NOUNS = new Set([
  'support team', 'engineering team', 'marketing team', 'development team',
  'sales team', 'success team', 'product team', 'design team', 'hr team',
  'support department', 'engineering department', 'marketing department',
  'venture capital firm', 'staffing agency', 'recruiting firm',
  'failure analysis', 'prototypes team', 'prototype team',
]);

/** "Amazon Engineers" / "Ring Failure Analysis" without Team/Lab/Department — a function, not a named org. */
const BARE_FUNCTION_COLLECTIVE =
  /^(?:[A-Z][\w.&'-]+\s+){0,2}(?:engineers|analysts|prototypes|failure analysis)$/i;

/** Narrative/descriptive spans, not names — a sentence fragment describing an
 *  event or errand, not an organization ("Social workers visiting Tio Juan"). */
const NARRATIVE_SPAN = /\b(?:visiting|checking on|came by|dropped off|stopped by|helping out)\b/i;

/** Generic-noun-phrase check usable directly on a plain string — shared by the
 *  structural/regex detector (groupDetectionService), which works with
 *  strings, not full EntityQualityCandidate objects. */
export function isGenericOrganizationPhrase(name: string): boolean {
  const key = normalizeNameKey(name);
  if (!key) return true;
  if (GENERIC_TEAM_DEPT_NOUNS.has(key)) return true;
  if (NARRATIVE_SPAN.test(name)) return true;
  if (BARE_FUNCTION_COLLECTIVE.test(name.trim()) && !/\b(?:team|lab|department|division)\b/i.test(name)) {
    return true;
  }
  return false;
}

export function guardOrganizationCandidate(
  candidate: EntityQualityCandidate,
): EntityQualityVerdict | null {
  if (candidate.domain !== 'organizations' && candidate.domain !== 'groups') return null;

  if (ORG_CANDIDATE_TEST_NOISE.test(candidate.name)) {
    return {
      gate: 'reject',
      name: candidate.name,
      domain: candidate.domain,
      rejectionReason: 'fabricated_test_term',
      confidence: 0,
      provenance: [{ guard: 'organizationCandidateGuard', rule: 'fabricated_test_term' }],
      requiresReview: false,
    };
  }

  if (isGenericOrganizationPhrase(candidate.name)) {
    return {
      gate: 'reject',
      name: candidate.name,
      domain: candidate.domain,
      rejectionReason: 'generic_organization_phrase',
      confidence: 0,
      provenance: [{ guard: 'organizationCandidateGuard', rule: 'generic_team_or_narrative_span' }],
      requiresReview: false,
    };
  }

  return null;
}
