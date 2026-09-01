import { describe, expect, it } from 'vitest';

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function eventSpansMultipleDays(event: { start_time: string; end_time: string | null }): boolean {
  if (!event.end_time) return false;
  return dayOf(event.start_time) !== dayOf(event.end_time);
}

describe('dayOccasion multi-day guard', () => {
  it('detects events that span more than one calendar day', () => {
    expect(eventSpansMultipleDays({
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: '2026-01-02T01:00:00.000Z',
    })).toBe(true);
    expect(eventSpansMultipleDays({
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: '2026-01-01T18:00:00.000Z',
    })).toBe(false);
    expect(eventSpansMultipleDays({
      start_time: '2026-01-01T09:00:00.000Z',
      end_time: null,
    })).toBe(false);
  });
});
