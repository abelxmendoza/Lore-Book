import { describe, it, expect } from 'vitest';
import { classifyTemporalQuery, occurredInWindow } from '../../src/services/temporal/temporalQueryService';

describe('temporalQueryService', () => {
  const now = new Date('2026-06-17T15:00:00.000Z');

  it('classifies TODAY_QUERY', () => {
    const r = classifyTemporalQuery('What did I do today?', now);
    expect(r.intent).toBe('TODAY_QUERY');
    expect(r.window?.label).toBe('today');
  });

  it('classifies YESTERDAY_QUERY', () => {
    const r = classifyTemporalQuery('What happened yesterday?', now);
    expect(r.intent).toBe('YESTERDAY_QUERY');
    expect(r.window?.label).toBe('yesterday');
  });

  it('classifies TIMELINE_QUERY for month references', () => {
    const r = classifyTemporalQuery('What was I doing in May?', now);
    expect(r.intent).toBe('TIMELINE_QUERY');
    expect(r.window).not.toBeNull();
  });

  it('occurredInWindow respects bounds', () => {
    const r = classifyTemporalQuery('What did I do today?', now);
    expect(r.window).not.toBeNull();
    expect(occurredInWindow('2026-06-17T10:00:00.000Z', r.window)).toBe(true);
    expect(occurredInWindow('2026-06-10T10:00:00.000Z', r.window)).toBe(false);
    expect(occurredInWindow(null, r.window)).toBe(false);
    expect(occurredInWindow(undefined, r.window)).toBe(false);
  });

  it('does not treat declarative journal text with bare today as TIME_RANGE_QUERY', () => {
    const journal =
      "I finished eating at Northwind Cafe now and I'm so full. I skipped band practice just to build MemoVault with Marcus and Jamie today.";
    const r = classifyTemporalQuery(journal, now);
    expect(r.intent).toBeNull();
  });

  describe('timezone-aware resolution', () => {
    // 2026-06-18T04:00:00Z = June 17, 9pm in Los Angeles (PDT, UTC-7).
    // A LA user's "yesterday" is June 16 — a full day off from the reference
    // instant's UTC calendar date (June 18).
    const crossBoundaryNow = new Date('2026-06-18T04:00:00.000Z');
    const LA = 'America/Los_Angeles';

    function laDay(iso: string): string {
      return new Date(iso).toLocaleDateString('en-CA', { timeZone: LA });
    }

    it('resolves "yesterday" to the user\'s local day when a timezone is given', () => {
      const r = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow, LA);
      expect(laDay(r.window!.start.toISOString())).toBe('2026-06-16');
      expect(laDay(r.window!.end.toISOString())).toBe('2026-06-16');
    });

    it('treats an explicit UTC timezone identically to omitting it', () => {
      const withUtc = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow, 'UTC');
      const omitted = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow);
      expect(withUtc.window?.start.toISOString()).toBe(omitted.window?.start.toISOString());
      expect(withUtc.window?.end.toISOString()).toBe(omitted.window?.end.toISOString());
    });

    it('treats a null/undefined timezone identically to omitting it', () => {
      const withNull = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow, null);
      const omitted = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow);
      expect(withNull.window?.start.toISOString()).toBe(omitted.window?.start.toISOString());
    });

    it('resolves a different real-instant window for LA than for Tokyo', () => {
      const la = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow, LA);
      const tokyo = classifyTemporalQuery('What happened yesterday?', crossBoundaryNow, 'Asia/Tokyo');
      expect(la.window?.start.toISOString()).not.toBe(tokyo.window?.start.toISOString());
    });
  });
});
