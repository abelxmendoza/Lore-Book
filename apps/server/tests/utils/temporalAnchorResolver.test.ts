import { describe, it, expect } from 'vitest';
import {
  resolveTemporalAnchor,
  resolveLastSeasonYear,
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
