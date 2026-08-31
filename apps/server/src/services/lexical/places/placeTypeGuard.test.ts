import { describe, expect, it } from 'vitest';

import { guardPlaceCandidate } from './placeTypeGuard';

describe('placeTypeGuard', () => {
  it('rejects employers extracted from resume-style context', () => {
    const result = guardPlaceCandidate(
      'Vanguard Robotics',
      'I was hired at Vanguard Robotics as a quality engineer.',
    );

    expect(result.allowed).toBe(false);
    expect(result.rejectedAs).toBe('ORGANIZATION');
    expect(result.rulesFired).toContain('employer_context_not_place');
  });
});
