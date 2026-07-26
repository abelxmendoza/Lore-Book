import { describe, expect, it } from 'vitest';
import { isFollowUpShaped, isRetryRequest } from './responseModeResolver';

describe('isRetryRequest', () => {
  it('matches common retry phrasings', () => {
    expect(isRetryRequest('try again')).toBe(true);
    expect(isRetryRequest('Try again!')).toBe(true);
    expect(isRetryRequest('retry')).toBe(true);
    expect(isRetryRequest('can you try again?')).toBe(true);
    expect(isRetryRequest('one more time')).toBe(true);
  });

  it('does not match an ordinary message', () => {
    expect(isRetryRequest("who's new and returning in this story?")).toBe(false);
    expect(isRetryRequest('try the new restaurant again sometime')).toBe(false);
  });
});

describe('isFollowUpShaped', () => {
  it('treats a retry request as follow-up shaped so it inherits active context', () => {
    expect(isFollowUpShaped('try again')).toBe(true);
  });
});
