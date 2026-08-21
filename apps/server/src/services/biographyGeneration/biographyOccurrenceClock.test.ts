import { describe, expect, it } from 'vitest';

import {
  biographyJournalOccurrence,
  mostActiveOccurrenceMonths,
  occurrenceSpanFromDates,
} from './biographyOccurrenceClock';

describe('biographyOccurrenceClock', () => {
  it('does not treat recording time as occurrence', () => {
    expect(
      biographyJournalOccurrence({
        date: null,
      }),
    ).toBeNull();
  });

  it('keeps a trustworthy journal occurrence', () => {
    expect(biographyJournalOccurrence({ date: '2024-07-12' })).toBe('2024-07-12');
  });

  it('imported old memories recorded today do not create a current era', () => {
    const span = occurrenceSpanFromDates([
      '2018-03-01T00:00:00.000Z',
      '2020-06-15T00:00:00.000Z',
      null,
    ]);
    expect(span.start.startsWith('2018-03-01')).toBe(true);
    expect(span.end.startsWith('2020-06-15')).toBe(true);
    expect(span.start).not.toContain('2026-08');
  });

  it('recording-only entries do not become the most active occurrence month', () => {
    const periods = mostActiveOccurrenceMonths([
      { date: null },
      { date: '2018-03-04T00:00:00.000Z' },
      { date: '2018-03-12T00:00:00.000Z' },
    ]);
    expect(periods).toEqual([
      expect.objectContaining({ month: 'March', year: 2018, entryCount: 2 }),
    ]);
  });

  it('unknown occurrence produces an empty span instead of NOW()', () => {
    const span = occurrenceSpanFromDates([null, undefined, '']);
    expect(span).toEqual({ start: '', end: '', days: 0, months: 0, years: 0 });
  });
});
