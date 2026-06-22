import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate } from './contradictionTypes';

export function preserveBothClaims(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
): { existing: EvidenceBundle; incoming: EvidenceBundle } {
  return {
    existing: { ...existing, truthState: existing.truthState === 'rejected' ? 'rejected' : 'contradicted' },
    incoming: { ...incoming, truthState: incoming.truthState === 'user_confirmed' ? incoming.truthState : 'review' as const },
  };
}

export function bothClaimsHaveProvenance(existing: EvidenceBundle, incoming: EvidenceBundle): boolean {
  return Boolean(existing.sourceQuote?.trim() && incoming.sourceQuote?.trim());
}

export function userCorrectionOutranks(
  incoming: EvidenceBundle,
  existing: EvidenceBundle,
): boolean {
  return (
    incoming.origin === 'user_corrected' ||
    incoming.origin === 'user_confirmed' ||
    incoming.sourceType === 'manual_edit'
  ) && existing.origin !== 'user_corrected' && existing.sourceType !== 'manual_edit';
}

export function knownCanonBeatsWeakExtraction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
): boolean {
  const canonStates = new Set(['confirmed', 'review']);
  const existingCanon =
    existing.origin === 'explicit_user_statement' ||
    existing.origin === 'user_confirmed' ||
    existing.truthState === 'confirmed';
  const weakIncoming =
    incoming.origin === 'system_inferred' ||
    incoming.origin === 'assistant_generated' ||
    incoming.confidence < 0.65;
  return existingCanon && weakIncoming;
}

export function buildContradictionCandidate(
  params: Omit<ContradictionCandidate, 'id' | 'requiresReview' | 'preserveBoth' | 'createdAt'>,
  seenAt?: string,
): ContradictionCandidate {
  return {
    id: crypto.randomUUID(),
    ...params,
    requiresReview: true,
    preserveBoth: true,
    createdAt: seenAt ?? new Date().toISOString(),
  };
}

export function markPreservedClaims(
  existingClaims: EvidenceBundle[],
  newClaim: EvidenceBundle,
  contradictions: ContradictionCandidate[],
): EvidenceBundle[] {
  const involved = new Set(
    contradictions.flatMap((c) => [c.existingClaim.id, c.newClaim.id]),
  );
  return [
    ...existingClaims.map((c) =>
      involved.has(c.id) ? { ...c, truthState: 'contradicted' as const } : c,
    ),
    involved.has(newClaim.id) ? { ...newClaim, truthState: 'review' as const } : newClaim,
  ];
}
