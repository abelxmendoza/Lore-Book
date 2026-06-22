import { describe, expect, it } from 'vitest';

import { isCharacterCardUserReviewed } from '../../../src/services/characters/audit/characterCardReviewState';

describe('characterCardReviewState', () => {
  it('treats keep, lock, and rename review actions as reviewed', () => {
    expect(isCharacterCardUserReviewed({ card_audit_review: { action: 'keep' } })).toBe(true);
    expect(isCharacterCardUserReviewed({ card_audit_review: { action: 'lock' } })).toBe(true);
    expect(isCharacterCardUserReviewed({ card_audit_review: { action: 'rename' } })).toBe(true);
  });

  it('treats card_audit_locked as reviewed', () => {
    expect(isCharacterCardUserReviewed({ card_audit_locked: true })).toBe(true);
    expect(isCharacterCardUserReviewed({ card_audit_locked: true, card_audit_review: { action: 'keep' } })).toBe(
      true,
    );
  });

  it('returns false for empty metadata', () => {
    expect(isCharacterCardUserReviewed(undefined)).toBe(false);
    expect(isCharacterCardUserReviewed({})).toBe(false);
  });
});
