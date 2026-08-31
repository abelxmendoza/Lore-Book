import { describe, expect, it } from 'vitest';
import { isFollowUpShaped, isRetryRequest, resolveResponseMode } from './responseModeResolver';

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

  it('treats who-is-he as follow-up shaped even without a question mark', () => {
    expect(isFollowUpShaped('who is he')).toBe(true);
    expect(isFollowUpShaped('who is she?')).toBe(true);
  });
});

describe('resolveResponseMode', () => {
  it('treats an incomplete work-history correction as focused recall', () => {
    expect(resolveResponseMode("that's not my full work history")).toBe('focused_recall');
  });
});
