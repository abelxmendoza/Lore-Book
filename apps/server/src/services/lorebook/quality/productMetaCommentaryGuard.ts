/**
 * Reject candidates whose evidence is meta-commentary about testing the
 * product with a throwaway/alt account ("using my alt account to test the
 * app") rather than something from the user's actual life. Deliberately
 * narrow — a bare mention of "LoreBook" or "the app" must stay allowed
 * (e.g. the founder legitimately tracking "LoreBook" itself as a project),
 * so this only fires on the specific alt-account-testing pattern, not on
 * mentionsLoreBookProduct's much broader product-conversation signals.
 */
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

const ALT_ACCOUNT_TESTING_RE =
  /\b(?:alt|alternate|second|another|test)\s+account\b[^.!?]{0,60}\btest(?:ing)?\s+(?:the\s+|this\s+)?app\b|\btest(?:ing)?\s+(?:the\s+|this\s+)?app\b[^.!?]{0,60}\b(?:alt|alternate|second|another|test)\s+account\b/i;

export function isAltAccountTestingCommentary(text: string): boolean {
  return ALT_ACCOUNT_TESTING_RE.test(text ?? '');
}

export function guardProductMetaCommentary(
  candidate: EntityQualityCandidate
): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  const contextText = [candidate.contextText, candidate.evidence].filter(Boolean).join(' ');

  if (isAltAccountTestingCommentary(name) || isAltAccountTestingCommentary(contextText)) {
    return {
      gate: 'reject',
      name,
      domain: candidate.domain,
      rejectionReason: 'product_meta_commentary',
      confidence: 0,
      provenance: [{ guard: 'productMetaCommentaryGuard', rule: 'lorebook_product_meta_commentary' }],
      requiresReview: false,
    };
  }

  return null;
}
