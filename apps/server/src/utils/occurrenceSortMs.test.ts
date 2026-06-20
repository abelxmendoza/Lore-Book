import { describe, expect, it } from 'vitest';

import { occurrenceSortMs } from './temporalOccurrence';

const t = (iso: string) => new Date(iso).getTime();
const CREATED = '2026-01-01T00:00:00Z';

describe('occurrenceSortMs', () => {
  it('uses exact start_time when present', () => {
    expect(occurrenceSortMs({ start_time: '2018-06-01T00:00:00Z' }, CREATED)).toBe(
      t('2018-06-01T00:00:00Z'),
    );
  });

  it('sorts an "occurred_before" memory just before the anchor', () => {
    const v = occurrenceSortMs({ occurred_before: '2018-06-01T00:00:00Z' }, CREATED, 1000);
    expect(v).toBe(t('2018-06-01T00:00:00Z') - 1000);
    // ...and therefore before a memory exactly at the anchor.
    expect(v).toBeLessThan(occurrenceSortMs({ start_time: '2018-06-01T00:00:00Z' }, CREATED));
  });

  it('sorts an "occurred_after" memory just after the anchor', () => {
    const v = occurrenceSortMs({ occurred_after: '2021-09-15T00:00:00Z' }, CREATED, 1000);
    expect(v).toBe(t('2021-09-15T00:00:00Z') + 1000);
  });

  it('uses the midpoint when both bounds are present ("around X")', () => {
    const v = occurrenceSortMs(
      { occurred_after: '2020-01-01T00:00:00Z', occurred_before: '2020-12-31T00:00:00Z' },
      CREATED,
    );
    expect(v).toBe(Math.round((t('2020-01-01T00:00:00Z') + t('2020-12-31T00:00:00Z')) / 2));
  });

  it('falls back to created_at when nothing is known (occurrence_unknown)', () => {
    expect(occurrenceSortMs({}, CREATED)).toBe(t(CREATED));
    expect(occurrenceSortMs(null, CREATED)).toBe(t(CREATED));
  });

  it('start_time wins over bounds', () => {
    const v = occurrenceSortMs(
      { start_time: '2015-01-01T00:00:00Z', occurred_before: '2018-06-01T00:00:00Z' },
      CREATED,
    );
    expect(v).toBe(t('2015-01-01T00:00:00Z'));
  });

  it('places a bounded memory in the right relative order vs a dated one', () => {
    // "quit my job before the move(2018)" should sort before "the move(2018)"
    // and before a 2019 memory.
    const beforeMove = occurrenceSortMs({ occurred_before: '2018-06-01T00:00:00Z' }, CREATED);
    const move = occurrenceSortMs({ start_time: '2018-06-01T00:00:00Z' }, CREATED);
    const later = occurrenceSortMs({ start_time: '2019-03-01T00:00:00Z' }, CREATED);
    expect([beforeMove, move, later].sort((a, b) => a - b)).toEqual([beforeMove, move, later]);
  });
});
