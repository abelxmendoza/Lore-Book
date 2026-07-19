import { describe, expect, it } from 'vitest';

import {
  EVENT_SIGNIFICANCE_THRESHOLD,
  mayPromoteMomentToEvent,
  scoreEventSignificance,
} from './eventSignificance';

describe('eventSignificance', () => {
  it('keeps routine day moments below the Event threshold', () => {
    const low = mayPromoteMomentToEvent({ text: 'I worked on MemoVault today.' });
    expect(low.score.total).toBeLessThan(EVENT_SIGNIFICANCE_THRESHOLD);
    expect(low.allow).toBe(false);

    const gym = mayPromoteMomentToEvent({ text: 'Back from the gym.' });
    expect(gym.allow).toBe(false);
  });

  it('promotes high-impact relationship and career happenings', () => {
    const breakup = mayPromoteMomentToEvent({
      text: 'Jamie blocked me after we broke up.',
    });
    expect(breakup.allow).toBe(true);
    expect(breakup.score.relationshipImpact).toBeGreaterThan(0);

    const job = mayPromoteMomentToEvent({
      text: 'I started onboarding at Vanguard Robotics after I got hired.',
    });
    expect(job.allow).toBe(true);
    expect(job.score.careerImpact).toBeGreaterThan(0);
  });

  it('scores recurrence and emphasis', () => {
    const scored = scoreEventSignificance({
      text: 'I finished background check for Vanguard Robotics.',
      conversationCount: 3,
      userEmphasis: true,
    });
    expect(scored.conversationRecurrence).toBeGreaterThan(0);
    expect(scored.userEmphasis).toBeGreaterThan(0);
    expect(scored.total).toBeGreaterThanOrEqual(EVENT_SIGNIFICANCE_THRESHOLD);
  });
});
