import { describe, it, expect } from 'vitest';
import {
  resolveTemporalAnchor,
  resolveLastSeasonYear,
  resolveAllTemporalAnchorsInTimezone,
} from '../../src/utils/temporalAnchorResolver';

describe('temporalAnchorResolver — last summer', () => {
  it('resolves last summer from mid-June 2026 to summer 2025', () => {
    const now = new Date('2026-06-18T12:00:00Z');
    expect(resolveLastSeasonYear(now, 'summer')).toBe(2025);

    const window = resolveTemporalAnchor('I went to Japan last summer.', now);
    expect(window).not.toBeNull();
    expect(window!.start.getFullYear()).toBe(2025);
    expect(window!.end.getMonth()).toBe(7); // August
    expect(window!.label).toBe('last summer');
  });

  it('resolves last summer after season ends to the most recent completed summer', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    expect(resolveLastSeasonYear(now, 'summer')).toBe(2026);

    const window = resolveTemporalAnchor('I went to Japan last summer.', now);
    expect(window!.start.getFullYear()).toBe(2026);
  });
});

describe('temporalAnchorResolver — relative yesterday', () => {
  it('anchors yesterday to message timestamp in America/Los_Angeles, not process now', () => {
    // Message written mid-day Jul 10 LA → yesterday = Jul 9 LA
    const messageCreatedAt = new Date('2026-07-10T19:00:00.000Z'); // 12:00 PDT
    const window = resolveAllTemporalAnchorsInTimezone(
      'I went to the gym yesterday',
      messageCreatedAt,
      'America/Los_Angeles',
    );
    expect(window).not.toBeNull();
    expect(window!.label).toBe('yesterday');
    // Jul 9 2026 in LA spans roughly 2026-07-09T07:00Z .. 2026-07-10T06:59Z
    expect(window!.start.toISOString().startsWith('2026-07-09')).toBe(true);
    expect(window!.end.getTime()).toBeGreaterThan(window!.start.getTime());
    // Must not resolve against "today" wall clock (process time)
    const processNow = new Date();
    if (processNow.getUTCFullYear() === 2026 && processNow.getUTCMonth() === 6) {
      // even in July 2026, message-anchored day is Jul 9, not "yesterday from now"
      expect(window!.start.getUTCDate()).toBe(9);
    }
  });
});
