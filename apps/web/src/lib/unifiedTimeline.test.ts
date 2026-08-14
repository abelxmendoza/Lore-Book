import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import {
  filterChronologyByExactDate,
  sortStitchedItemsNewestFirst,
  stitchedItemsToChronology,
} from './unifiedTimeline';

describe('stitchedItemsToChronology', () => {
  it('preserves canonical identity and honest temporal fields (no invented exact/1)', () => {
    const item: StitchedTimelineItem = {
      id: 'event:canonical',
      kind: 'event',
      sourceId: 'canonical',
      sourceIds: ['canonical', 'duplicate'],
      sourceKind: 'resolved_event',
      sourceType: 'calendar',
      sortTime: '2026-07-18T12:00:00.000Z',
      userSortIndex: null,
      title: 'Launch day',
      body: 'The product launched.',
      tags: ['career'],
      userPresence: 'attended',
      timePrecision: 'date',
      timeConfidence: 0.9,
      temporalSource: 'user_stated',
    };

    expect(stitchedItemsToChronology([item], 'user-1')).toEqual([
      expect.objectContaining({
        id: 'event:canonical',
        user_id: 'user-1',
        journal_entry_id: '',
        source_kind: 'resolved_event',
        source_id: 'canonical',
        source_ids: ['canonical', 'duplicate'],
        source_type: 'calendar',
        title: 'Launch day',
        content: 'Launch day\nThe product launched.',
        timeline_names: ['calendar'],
        tags: ['career'],
        user_presence: 'attended',
        time_precision: 'day',
        time_confidence: 0.9,
      }),
    ]);
  });

  it('does not invent exact precision or confidence 1 when missing', () => {
    const item: StitchedTimelineItem = {
      id: 'event:x',
      kind: 'event',
      sourceId: 'x',
      sourceIds: ['x'],
      sourceKind: 'resolved_event',
      sourceType: 'resolved_event',
      sortTime: '2026-06-01T00:00:00.000Z',
      userSortIndex: null,
      title: 'Something',
      body: 'Something',
    };
    const [entry] = stitchedItemsToChronology([item]);
    expect(entry.time_precision).toBe('approximate');
    expect(entry.time_confidence).toBe(0.5);
  });

  it('preserves a fuzzy historical range instead of flattening it to one date', () => {
    const item: StitchedTimelineItem = {
      id: 'event:kiley', kind: 'event', sourceId: 'kiley', sourceIds: ['kiley'],
      sourceKind: 'resolved_event', sourceType: 'chat',
      sortTime: '2015-01-01T00:00:00.000Z', userSortIndex: null,
      title: 'Relationship with Kiley', body: '2015–2019', timePrecision: 'year',
      temporal: {
        occurred: {
          start: '2015-01-01T00:00:00.000Z', end: '2019-12-31T23:59:59.999Z',
          precision: 'year', source: 'user_stated', status: 'approximate', confidence: 0.9,
          expression: '2015–2019', timezone: null,
        },
        mentionedAt: null, recordedAt: null, knownFrom: 'message-1',
        validFrom: null, validUntil: null, provenance: [],
      },
    };
    const [entry] = stitchedItemsToChronology([item]);
    expect(entry.start_time).toBe('2015-01-01T00:00:00.000Z');
    expect(entry.end_time).toBe('2019-12-31T23:59:59.999Z');
    expect(entry.time_precision).toBe('year');
  });

  it('finds every canonical source on the selected calendar day', () => {
    const entries = stitchedItemsToChronology([
      {
        id: 'moment:1', kind: 'moment', sourceId: '1', sourceIds: ['1'],
        sourceKind: 'journal_entry', sourceType: 'calendar',
        sortTime: '2026-07-18T09:00:00.000Z', userSortIndex: null,
        title: 'Breakfast', body: 'Breakfast',
      },
      {
        id: 'event:2', kind: 'event', sourceId: '2', sourceIds: ['2'],
        sourceKind: 'resolved_event', sourceType: 'resolved_event',
        sortTime: '2026-07-19T01:00:00.000Z', userSortIndex: null,
        title: 'Next day', body: 'Next day',
      },
    ]);

    expect(filterChronologyByExactDate(entries, '2026-07-18').map((entry) => entry.id))
      .toEqual(['moment:1']);
  });

  it('places the newest Omni event first without mutating canonical order', () => {
    const older = {
      id: 'event:older', kind: 'event' as const, sourceId: 'older', sourceIds: ['older'],
      sourceKind: 'resolved_event' as const, sourceType: 'resolved_event',
      sortTime: '2025-01-01T00:00:00.000Z', userSortIndex: null,
      title: 'Older', body: 'Older',
    };
    const newer = {
      ...older,
      id: 'event:newer', sourceId: 'newer', sourceIds: ['newer'],
      sortTime: '2026-07-18T00:00:00.000Z', title: 'Newer', body: 'Newer',
    };
    const canonical = [older, newer];

    expect(sortStitchedItemsNewestFirst(canonical).map((item) => item.id))
      .toEqual(['event:newer', 'event:older']);
    expect(canonical.map((item) => item.id)).toEqual(['event:older', 'event:newer']);
  });
});
