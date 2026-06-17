import { describe, expect, it } from 'vitest';
import { clampOccurrenceDate } from '../../src/utils/temporalOccurrence';

describe('temporalOccurrence', () => {
  it('clamps far-future extraction dates to now', () => {
    const now = new Date('2026-06-16T12:00:00Z');
    const future = new Date('2030-01-01T00:00:00Z');
    const clamped = clampOccurrenceDate(future, now);
    expect(clamped?.toISOString()).toBe(now.toISOString());
  });

  it('preserves past and near-future dates', () => {
    const now = new Date('2026-06-16T12:00:00Z');
    const yesterday = new Date('2026-06-15T12:00:00Z');
    expect(clampOccurrenceDate(yesterday, now)?.toISOString()).toBe(yesterday.toISOString());
  });
});
