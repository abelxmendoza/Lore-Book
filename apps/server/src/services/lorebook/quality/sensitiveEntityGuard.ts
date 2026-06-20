/**
 * Route sensitive/private claims to review — residences, family, identity collisions.
 */

import { analyzePrivateResidence } from '../../lexical/places/privateResidenceGuard';
import {
  isIdentityCollisionText,
  isPrivateResidenceContext,
  isRomanticContext,
} from '../parser/parserGateService';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

const EXACT_ADDRESS =
  /\b\d+\s+[A-Za-z0-9.'-]+\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court)\b/i;

const SENSITIVE_FAMILY =
  /\b(?:estranged|custody|abuse|divorce|affair|cheat|pregnant|miscarriage|suicide|overdose|arrest|prison|deportation)\b/i;

export function guardSensitiveEntity(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  const contextText = [candidate.contextText, candidate.evidence].filter(Boolean).join(' ');
  const key = normalizeNameKey(name);

  if (EXACT_ADDRESS.test(name) || EXACT_ADDRESS.test(contextText)) {
    return review(name, candidate.domain, 'exact_street_address', 0.95);
  }

  const residence = analyzePrivateResidence(name);
  if (residence?.privacySensitive || isPrivateResidenceContext(name, contextText)) {
    if (candidate.domain === 'locations' || candidate.domain === 'family') {
      return review(name, candidate.domain, 'private_residence', 0.85);
    }
  }

  if (isIdentityCollisionText(contextText)) {
    return review(name, candidate.domain, 'identity_collision_context', 0.9);
  }

  if (isRomanticContext(contextText) && (candidate.domain === 'characters' || candidate.domain === 'relationships')) {
    return review(name, candidate.domain, 'romantic_context', 0.75);
  }

  if (SENSITIVE_FAMILY.test(contextText)) {
    return review(name, candidate.domain, 'sensitive_family_claim', 0.88);
  }

  if (
    (candidate.domain === 'family' || candidate.domain === 'relationships') &&
    /\b(?:tio|tía|tia|cousin|uncle|aunt|stepdad|stepmom)\b/i.test(key)
  ) {
    return review(name, candidate.domain, 'family_kinship_review', 0.7);
  }

  return null;
}

function review(
  name: string,
  domain: EntityQualityCandidate['domain'],
  rule: string,
  confidence: number
): EntityQualityVerdict {
  return {
    gate: 'review',
    name,
    domain,
    rejectionReason: rule,
    confidence,
    provenance: [{ guard: 'sensitiveEntityGuard', rule }],
    requiresReview: true,
  };
}
