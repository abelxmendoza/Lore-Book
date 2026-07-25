import { describe, expect, it } from 'vitest';
import { detectParticipationState } from '../../src/services/chat/participationClaimGuard';

describe('participation claim guard', () => {
  it('does not infer attendance from interest or a mention', () => {
    expect(detectParticipationState('Harbor Fest is on my mind.')).toEqual({
      desire: null,
      attendance: null,
      performance: null,
    });
    expect(detectParticipationState('I want to go to Harbor Fest.')).toEqual({
      desire: true,
      attendance: null,
      performance: null,
    });
  });

  it('preserves explicit non-attendance and non-performance', () => {
    expect(detectParticipationState('I will not attend or perform at Harbor Fest.')).toEqual({
      desire: null,
      attendance: false,
      performance: false,
    });
  });
});
