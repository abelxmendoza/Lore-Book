import { describe, it, expect } from 'vitest';
import { formatEventTime } from './formatEventTime';

const ISO = '2026-07-04T19:00:00Z';
const UTC = 'UTC';

describe('formatEventTime — precision-honest display', () => {
  it('formats every precision level without fabricated detail', () => {
    const base = { start_time: ISO, temporal_status: 'anchored' };
    expect(formatEventTime({ ...base, temporal_precision: 'date' }, { timeZone: UTC })).toBe('Jul 4, 2026');
    expect(formatEventTime({ ...base, temporal_precision: 'month' }, { timeZone: UTC })).toBe('July 2026');
    expect(formatEventTime({ ...base, temporal_precision: 'year' }, { timeZone: UTC })).toBe('2026');
    expect(formatEventTime({ ...base, temporal_precision: 'season' }, { timeZone: UTC })).toMatch(/^(Spring|Summer|Fall|Winter) 2026$/);
  });

  it('marks approximate values and never shows unknowns as dates', () => {
    expect(
      formatEventTime(
        { start_time: ISO, temporal_precision: 'date', temporal_status: 'approximate' },
        { timeZone: UTC },
      ),
    ).toBe('~Jul 4, 2026');
    expect(formatEventTime({ start_time: null })).toBe('Date unknown');
    expect(formatEventTime({ start_time: ISO, temporal_status: 'unanchored' })).toBe('Date unknown');
    expect(formatEventTime({ start_time: ISO, temporal_precision: 'unknown' })).toBe('Date unknown');
  });

  it('legacy rows without precision metadata drop the fabricated clock time', () => {
    const legacy = '2026-06-16T04:15:39Z';
    const out = formatEventTime({ start_time: legacy }, { timeZone: UTC });
    expect(out).toBe('Jun 16, 2026');
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats exact time in the user timezone, not the UTC prefix day', () => {
    const iso = '2026-08-20T02:30:00Z';
    const out = formatEventTime(
      { start_time: iso, temporal_precision: 'exact', temporal_status: 'anchored' },
      { timeZone: 'America/Los_Angeles' },
    ).replace(/\s/g, ' ');
    expect(out).toBe('Aug 19, 2026 7:30 PM');
  });
});
