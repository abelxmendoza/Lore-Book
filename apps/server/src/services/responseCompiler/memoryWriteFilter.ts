import type { BlockedMemoryCandidate, GroundedClaim } from './responseCompilerTypes';
import { statementKindBlocksCanon } from './inferenceClassifier';

/**
 * Hard rule: assistant output cannot become durable memory without user confirmation.
 * Even grounded summaries remain assistant narration — review queue only.
 */
export function filterMemoryWrites(groundedClaims: GroundedClaim[]): BlockedMemoryCandidate[] {
  const blocked: BlockedMemoryCandidate[] = [];

  for (const claim of groundedClaims) {
    let reason = 'Assistant-generated content — review candidate only, not canon';

    if (claim.grounding === 'contradicted') {
      reason = 'Contradicts established canon — do not store';
    } else if (claim.grounding === 'unsupported') {
      reason = 'Unsupported assistant claim — requires user witness';
    } else if (statementKindBlocksCanon(claim.statementKind)) {
      reason = `Assistant ${claim.statementKind.toLowerCase()} — not user-originated fact`;
    } else if (claim.grounding === 'inferred') {
      reason = 'Inferred from assistant narration — review only';
    } else if (claim.grounding === 'grounded') {
      reason = 'Grounded assistant summary — traceable but narrator is assistant, not user';
    }

    blocked.push({
      claim: claim.claim,
      reason,
      category: claim.type,
    });
  }

  return blocked;
}

/** Assistant-origin claims never auto-promote to durable memory. */
export function mayPromoteToMemory(_claim: GroundedClaim): boolean {
  return false;
}
