import { canOverride, correctionOutranksInference } from './truthAuthorityRanker';
import type { TruthClaim, TruthState } from './truthStateTypes';
import { isDurableTruthState } from './truthStateTypes';

function normalizeClaim(text: string): string {
  return text.toLowerCase().replace(/[^\w\s']/g, '').replace(/\s+/g, ' ').trim();
}

function sharedSubject(a: TruthClaim, b: TruthClaim): boolean {
  const aWords = normalizeClaim(a.claimText).split(' ').filter((w) => w.length > 3);
  const bWords = normalizeClaim(b.claimText).split(' ').filter((w) => w.length > 3);
  return aWords.some((w) => bWords.includes(w));
}

export function claimsConflict(existing: TruthClaim, incoming: TruthClaim): boolean {
  if (existing.claimType !== incoming.claimType) return false;
  if (!sharedSubject(existing, incoming)) return false;
  if (normalizeClaim(existing.claimText) === normalizeClaim(incoming.claimText)) return false;

  if (existing.claimType === 'relationship') {
    const negA = /\bnot\b/.test(existing.claimText);
    const negB = /\bnot\b/.test(incoming.claimText);
    return negA !== negB || normalizeClaim(existing.claimText) !== normalizeClaim(incoming.claimText);
  }

  if (existing.claimType === 'identity') {
    return normalizeClaim(existing.claimText) !== normalizeClaim(incoming.claimText);
  }

  return normalizeClaim(existing.claimText) !== normalizeClaim(incoming.claimText);
}

export type ContradictionResolution = {
  existingClaim: TruthClaim;
  incomingClaim: TruthClaim;
  existingState: TruthState;
  incomingState: TruthState;
  reviewRequired: true;
};

export function resolveContradiction(
  existing: TruthClaim,
  incoming: TruthClaim,
): ContradictionResolution {
  return {
    existingClaim: { ...existing, truthState: 'contradicted' },
    incomingClaim: { ...incoming, truthState: 'review_required' },
    existingState: 'contradicted',
    incomingState: 'review_required',
    reviewRequired: true,
  };
}

export function findCanonConflict(
  incoming: TruthClaim,
  priorClaims: TruthClaim[],
): TruthClaim | undefined {
  return priorClaims.find(
    (existing) =>
      isDurableTruthState(existing.truthState) &&
      existing.truthState !== 'archived' &&
      existing.truthState !== 'rejected' &&
      claimsConflict(existing, incoming),
  );
}

export function shouldApplyIncoming(
  incoming: TruthClaim,
  existing: TruthClaim,
): boolean {
  if (correctionOutranksInference(incoming.origin, existing.origin)) return true;
  if (canOverride(incoming.origin, existing.origin)) return true;
  return false;
}

export function preservesBothSides(
  existing: TruthClaim,
  incoming: TruthClaim,
): [TruthClaim, TruthClaim] {
  const resolved = resolveContradiction(existing, incoming);
  return [resolved.existingClaim, resolved.incomingClaim];
}
