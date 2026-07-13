import { describe, it, expect } from 'vitest';

import {
  chooseTemporal,
  classifyTemporalExpression,
  evidenceClassRank,
  statusFor,
  unanchoredEvidence,
  type TemporalEvidence,
} from './temporalEvidence';
import { resolveChronoWindows } from '../../utils/temporalAnchorResolver';

// Deterministic reference clock: 2026-07-06T04:30:00Z = July 5, 9:30 PM in LA.
const NOW = new Date('2026-07-06T04:30:00Z');
const LA = 'America/Los_Angeles';

const ev = (over: Partial<TemporalEvidence>): TemporalEvidence => ({
  ...unanchoredEvidence(),
  start: '2026-07-04T00:00:00Z',
  confidence: 0.5,
  ...over,
});

function laDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: LA });
}

describe('evidence classes and precedence', () => {
  it('a stated date beats a higher-confidence relative expression', () => {
    const stated = ev({ source: 'user_stated', precision: 'date', confidence: 0.6 });
    const relative = ev({ source: 'relative_expression', precision: 'date', confidence: 0.99 });
    expect(chooseTemporal(relative, stated)).toBe(stated);
    expect(chooseTemporal(stated, relative)).toBe(stated);
  });

  it('user correction is authoritative over everything', () => {
    const corrected = ev({ source: 'user_corrected', precision: 'date', confidence: 0.1 });
    const stated = ev({ source: 'user_stated', precision: 'exact', confidence: 1 });
    expect(chooseTemporal(stated, corrected)).toBe(corrected);
    expect(chooseTemporal(corrected, stated)).toBe(corrected);
  });

  it('recording fallback can never overwrite anything, and null start ranks zero', () => {
    const inferred = ev({ source: 'context_inferred', confidence: 0.2 });
    const recording = ev({ source: 'recording_fallback', confidence: 1 });
    expect(chooseTemporal(inferred, recording)).toBe(inferred);
    expect(evidenceClassRank(ev({ start: null }))).toBe(0);
  });

  it('confidence breaks ties only within a class', () => {
    const a = ev({ source: 'relative_expression', confidence: 0.5 });
    const b = ev({ source: 'relative_expression', confidence: 0.8 });
    expect(chooseTemporal(a, b)).toBe(b);
  });

  it('explicit partial dates rank below full dates but above relatives', () => {
    const month = evidenceClassRank(ev({ source: 'user_stated', precision: 'month' }));
    const date = evidenceClassRank(ev({ source: 'user_stated', precision: 'date' }));
    const rel = evidenceClassRank(ev({ source: 'relative_expression', precision: 'date' }));
    expect(date).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(rel);
  });
});

describe('expression classification', () => {
  it('classifies stated calendar dates', () => {
    expect(classifyTemporalExpression('Saturday July 4th 2026')).toEqual({ source: 'user_stated', precision: 'date' });
    expect(classifyTemporalExpression('7/4/2026')).toEqual({ source: 'user_stated', precision: 'date' });
    expect(classifyTemporalExpression('July 2026')).toEqual({ source: 'user_stated', precision: 'month' });
  });

  it('classifies relative expressions', () => {
    expect(classifyTemporalExpression('last night').source).toBe('relative_expression');
    expect(classifyTemporalExpression('yesterday').source).toBe('relative_expression');
    expect(classifyTemporalExpression('3 days ago').source).toBe('relative_expression');
  });
});

describe('status honesty', () => {
  it('no evidence stays unanchored; stated dates anchor; relatives approximate', () => {
    expect(statusFor({ ...unanchoredEvidence() }).valueOf()).toBe('unanchored');
    expect(statusFor(ev({ source: 'user_stated', precision: 'date' }))).toBe('anchored');
    expect(statusFor(ev({ source: 'relative_expression', precision: 'date', confidence: 0.7 }))).toBe('approximate');
    expect(statusFor(ev({ source: 'user_corrected', precision: 'date' }))).toBe('corrected');
  });
});

describe('timezone-correct relative resolution (UTC boundary)', () => {
  it('"yesterday" near the UTC date line resolves in the LA day, not the UTC day', () => {
    // At NOW it is already July 6 in UTC but still July 5 in LA.
    const windows = resolveChronoWindows('we met yesterday', NOW, LA);
    expect(windows.length).toBeGreaterThan(0);
    expect(laDay(windows[0].start.toISOString())).toBe('2026-07-04');
  });

  it('"last night" does not jump to the next local day', () => {
    const windows = resolveChronoWindows('I went out last night', NOW, LA);
    expect(windows.length).toBeGreaterThan(0);
    const day = laDay(windows[0].start.toISOString());
    expect(['2026-07-04', '2026-07-05']).toContain(day);
    expect(day).not.toBe('2026-07-06');
  });

  it('handles the DST spring-forward boundary', () => {
    // 2026-03-08 02:00 PST → PDT. Reference: Mar 9, 6 PM PDT (Mar 10 01:00 UTC).
    const dstNow = new Date('2026-03-10T01:00:00Z');
    const windows = resolveChronoWindows('yesterday was rough', dstNow, LA);
    expect(windows.length).toBeGreaterThan(0);
    expect(laDay(windows[0].start.toISOString())).toBe('2026-03-08');
  });
});

describe('AX regression fixture — "Saturday July 4th 2026"', () => {
  const STORY =
    'I went to the club last night after the comic con, there was an afters at the Warehouse. ' +
    'It was a fun weekend, Saturday July 4th 2026.';

  it('extracts the stated date and it OUTRANKS the relative expression', () => {
    const windows = resolveChronoWindows(STORY, NOW, LA);
    const ranked = windows
      .map((w) => {
        const cls = classifyTemporalExpression(w.label);
        return { w, rank: evidenceClassRank({ start: 'x', source: cls.source, precision: cls.precision }) };
      })
      .sort((a, b) => b.rank - a.rank || b.w.confidence - a.w.confidence);

    expect(ranked.length).toBeGreaterThan(0);
    const best = ranked[0];
    expect(best.w.label.toLowerCase()).toContain('july 4th 2026');
    expect(laDay(best.w.start.toISOString())).toBe('2026-07-04');
    // And the classification is a stated date, not an inference.
    expect(classifyTemporalExpression(best.w.label).source).toBe('user_stated');
  });

  it('date-only statements gain no fabricated clock time in evidence terms', () => {
    const cls = classifyTemporalExpression('Saturday July 4th 2026');
    expect(cls.precision).toBe('date');
  });
});
