import { describe, expect, it } from 'vitest';

import { isExplicitlyUserConfirmed, isReviewPending } from './reviewableRecord';

describe('reviewableRecord', () => {
  it('recognizes pending imported metadata', () => {
    expect(isReviewPending({ review_required: true })).toBe(true);
    expect(isReviewPending({ review_state: 'pending' })).toBe(true);
    expect(isReviewPending({ review_state: 'pending_verification' })).toBe(true);
  });

  it('lets explicit user confirmation override pending provenance', () => {
    const metadata = {
      review_required: true,
      review_state: 'pending',
      user_confirmed: true,
    };

    expect(isExplicitlyUserConfirmed(metadata)).toBe(true);
    expect(isReviewPending(metadata)).toBe(false);
  });
});
