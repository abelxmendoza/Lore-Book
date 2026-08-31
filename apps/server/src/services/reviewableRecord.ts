/**
 * Shared truth-state policy for derived records.
 *
 * Import provenance is evidence until the user confirms it. Internal writers
 * may still read pending rows for deduplication and confirmation workflows;
 * display/query surfaces should use isReviewPending unless they explicitly
 * request the review queue.
 */
export function isExplicitlyUserConfirmed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const value = metadata as Record<string, unknown>;
  return value.user_confirmed === true
    || value.review_state === 'user_confirmed'
    || value.truth_state === 'user_confirmed';
}

export function isReviewPending(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  if (isExplicitlyUserConfirmed(metadata)) return false;
  const value = metadata as Record<string, unknown>;
  const state = String(value.review_state ?? value.truth_state ?? '').toLowerCase();
  return value.review_required === true
    || ['pending', 'review_required', 'pending_verification'].includes(state);
}
