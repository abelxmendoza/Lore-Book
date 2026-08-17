import { describe, expect, it } from 'vitest';

import {
  collectAdditionalTemporalReferences,
  parseChronoReferences,
  parseMessageTimestamp,
  resolveChronoInText,
  resolveTemporalWindow,
} from '../../src/utils/temporalResolver';

describe('temporalResolver', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it('prefers LoreBook anchor over chrono for yesterday', () => {
    const window = resolveTemporalWindow('I went running yesterday.', now);
    expect(window?.label).toBe('yesterday');
    expect(window!.confidence).toBeGreaterThan(0.9);
  });

  it('resolves generic dates via chrono when no anchor matches', () => {
    const window = resolveChronoInText('We met on March 15, 2024.', now);
    expect(window).not.toBeNull();
    expect(window!.start.getFullYear()).toBe(2024);
    expect(window!.start.getMonth()).toBe(2);
    expect(window!.confidence).toBe(0.72);
  });

  it('parseChronoReferences finds relative durations', () => {
    const refs = parseChronoReferences('I started 3 days ago.', now);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].start.getTime()).toBeLessThan(now.getTime());
  });

  it('resolveTemporalWindow falls back to chrono for absolute dates', () => {
    const window = resolveTemporalWindow('Interview on June 10, 2025.', now);
    expect(window).not.toBeNull();
    expect(window!.start.getFullYear()).toBe(2025);
    expect(window!.start.getMonth()).toBe(5);
  });

  it('collectAdditionalTemporalReferences dedupes by label', () => {
    const seen = new Set<string>(['yesterday']);
    const refs = collectAdditionalTemporalReferences('yesterday and March 1, 2024', now, seen);
    expect(refs.some((r) => r.label === 'yesterday')).toBe(false);
    expect(refs.some((r) => r.label?.includes('March') || r.label?.includes('2024'))).toBe(true);
  });

  it('parseMessageTimestamp returns fuzzy for atemporal text', () => {
    const parsed = parseMessageTimestamp('I like sushi', now, false);
    expect(parsed.type).toBe('fuzzy');
    expect(parsed.confidence).toBeLessThan(0.5);
  });

  it('parseMessageTimestamp defaults to now when requested', () => {
    const parsed = parseMessageTimestamp('', now, true);
    expect(parsed.confidence).toBe(0.7);
    expect(parsed.timestamp).toEqual(now);
  });

  describe('timezone-aware references', () => {
    // 2026-06-18T04:00:00Z = June 17, 9pm in Los Angeles (PDT, UTC-7).
    const crossBoundaryNow = new Date('2026-06-18T04:00:00.000Z');
    const LA = 'America/Los_Angeles';

    function laDay(iso: string): string {
      return new Date(iso).toLocaleDateString('en-CA', { timeZone: LA });
    }

    it('collectAdditionalTemporalReferences resolves the anchor fallback in the user\'s local day', () => {
      const refs = collectAdditionalTemporalReferences('yesterday', crossBoundaryNow, new Set(), LA);
      const anchorRef = refs.find((r) => r.label === 'yesterday');
      expect(anchorRef).toBeDefined();
      expect(laDay(anchorRef!.timestamp.toISOString())).toBe('2026-06-16');
    });

    it('collectAdditionalTemporalReferences matches zone-naive behavior for UTC/omitted timezone', () => {
      const withUtc = collectAdditionalTemporalReferences('yesterday', crossBoundaryNow, new Set(), 'UTC');
      const omitted = collectAdditionalTemporalReferences('yesterday', crossBoundaryNow, new Set());
      expect(withUtc.find((r) => r.label === 'yesterday')?.timestamp.toISOString()).toBe(
        omitted.find((r) => r.label === 'yesterday')?.timestamp.toISOString(),
      );
    });

    it('parseChronoReferences resolves an absolute date the same regardless of timezone', () => {
      // Absolute calendar dates are unambiguous — timezone should not shift them.
      const withTz = parseChronoReferences('We met on March 15, 2024.', crossBoundaryNow, LA);
      const withoutTz = parseChronoReferences('We met on March 15, 2024.', crossBoundaryNow);
      expect(withTz[0]?.start.getFullYear()).toBe(2024);
      expect(withTz[0]?.start.getMonth()).toBe(2);
      expect(withTz[0]?.start.getDate()).toBe(withoutTz[0]?.start.getDate());
    });
  });
});
