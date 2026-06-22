import { detectDomainContradictions } from './domainContradictionService';
import { detectIdentityCollisions } from './identityContradictionService';
import {
  bothClaimsHaveProvenance,
  markPreservedClaims,
  userCorrectionOutranks,
} from './contradictionProvenanceService';
import { detectRelationshipContradictions } from './relationshipContradictionService';
import { detectStatusEvents } from './statusContradictionService';
import { detectTimelineContradictions } from './timelineContradictionService';
import type {
  ContradictionCandidate,
  ContradictionDetectionInput,
  ContradictionDetectionResult,
} from './contradictionTypes';
import { buildReviewQueue } from './contradictionReviewService';

function dedupeCandidates(candidates: ContradictionCandidate[]): ContradictionCandidate[] {
  const seen = new Set<string>();
  const out: ContradictionCandidate[] = [];
  for (const c of candidates) {
    const key = `${c.contradictionType}:${c.existingClaim.id}:${c.newClaim.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function detectContradictions(input: ContradictionDetectionInput): ContradictionDetectionResult {
  const { existingClaims, newClaim, knownCanonDomains = {}, seenAt } = input;

  if (!bothClaimsHaveProvenance(existingClaims[0] ?? newClaim, newClaim) && !newClaim.sourceQuote?.trim()) {
    return {
      contradictions: [],
      transitions: [],
      rejectedWeakExtractions: [newClaim],
      preservedClaims: existingClaims,
    };
  }

  if (userCorrectionOutranks(newClaim, existingClaims[0] ?? newClaim)) {
    return {
      contradictions: [],
      transitions: [],
      rejectedWeakExtractions: [],
      preservedClaims: [...existingClaims, { ...newClaim, truthState: 'confirmed' }],
    };
  }

  const candidates: ContradictionCandidate[] = [];

  candidates.push(...detectIdentityCollisions(existingClaims, newClaim, seenAt));
  candidates.push(...detectRelationshipContradictions(existingClaims, newClaim, seenAt));
  candidates.push(...detectTimelineContradictions(existingClaims, newClaim, seenAt));

  const { contradictions: statusContra, transitions } = detectStatusEvents(
    existingClaims,
    newClaim,
    seenAt,
  );
  candidates.push(...statusContra);

  const { contradictions: domainContra, rejected } = detectDomainContradictions(
    existingClaims,
    newClaim,
    knownCanonDomains,
    seenAt,
  );
  candidates.push(...domainContra);

  const contradictions = dedupeCandidates(candidates);
  const preservedClaims = markPreservedClaims(existingClaims, newClaim, contradictions);

  return {
    contradictions,
    transitions,
    rejectedWeakExtractions: rejected,
    preservedClaims,
  };
}

export class ContradictionDetectionService {
  detect(input: ContradictionDetectionInput): ContradictionDetectionResult & {
    reviewQueue: ReturnType<typeof buildReviewQueue>;
  } {
    const result = detectContradictions(input);
    return { ...result, reviewQueue: buildReviewQueue(result.contradictions) };
  }
}

export const contradictionDetectionService = new ContradictionDetectionService();

export { buildReviewQueue, requiresCriticalReview } from './contradictionReviewService';
