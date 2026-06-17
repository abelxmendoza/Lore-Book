import { describe, expect, it } from 'vitest';

import { detectEmploymentGaps, normalizeResumeDate } from '../../src/services/profileClaims/resumeLorePopulationService';

describe('resumeLorePopulationService', () => {
  it('normalizes resume date formats', () => {
    expect(normalizeResumeDate('2020')).toBe('2020-01-01');
    expect(normalizeResumeDate('2020-06')).toBe('2020-06-01');
    expect(normalizeResumeDate('Present')).toBeNull();
    expect(normalizeResumeDate('current', true)).toBeTruthy();
  });

  it('detects employment gaps of 2+ months', () => {
    const gaps = detectEmploymentGaps([
      { company: 'A', title: 'Dev', startDate: '2018-01', endDate: '2019-06' },
      { company: 'B', title: 'Sr Dev', startDate: '2020-01', endDate: '2021-01' },
    ]);
    expect(gaps.length).toBe(1);
    expect(gaps[0].label).toContain('A');
    expect(gaps[0].label).toContain('B');
  });
});
