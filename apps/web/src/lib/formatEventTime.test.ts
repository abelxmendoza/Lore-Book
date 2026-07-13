import { describe, it, expect } from 'vitest';
import { format, parseISO } from 'date-fns';
import { formatEventTime } from './formatEventTime';

// Assertions are machine-timezone independent: we validate PRECISION
// truncation by comparing against date-fns output for the same instant.
const ISO = '2026-07-04T19:00:00Z';
const d = parseISO(ISO);

describe('formatEventTime — precision-honest display', () => {
  it('formats every precision level without fabricated detail', () => {
    const base = { start_time: ISO, temporal_status: 'anchored' };
    expect(formatEventTime({ ...base, temporal_precision: 'date' })).toBe(format(d, 'MMM d, yyyy'));
    expect(formatEventTime({ ...base, temporal_precision: 'month' })).toBe(format(d, 'MMMM yyyy'));
    expect(formatEventTime({ ...base, temporal_precision: 'year' })).toBe(format(d, 'yyyy'));
    expect(formatEventTime({ ...base, temporal_precision: 'season' })).toMatch(/^(Spring|Summer|Fall|Winter) \d{4}$/);
  });

  it('marks approximate values and never shows unknowns as dates', () => {
    expect(
      formatEventTime({ start_time: ISO, temporal_precision: 'date', temporal_status: 'approximate' }),
    ).toBe('~' + format(d, 'MMM d, yyyy'));
    expect(formatEventTime({ start_time: null })).toBe('Date unknown');
    expect(formatEventTime({ start_time: ISO, temporal_status: 'unanchored' })).toBe('Date unknown');
    expect(formatEventTime({ start_time: ISO, temporal_precision: 'unknown' })).toBe('Date unknown');
  });

  it('legacy rows without precision metadata drop the fabricated clock time', () => {
    const legacy = '2026-06-16T04:15:39Z';
    const out = formatEventTime({ start_time: legacy });
    expect(out).toBe(format(parseISO(legacy), 'MMM d, yyyy'));
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
