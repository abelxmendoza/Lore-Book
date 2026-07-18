import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import { filterChronologyByExactDate, stitchedItemsToChronology } from './unifiedTimeline';

describe('stitchedItemsToChronology', () => {
  it('preserves canonical identity and source provenance across Omni views', () => {
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
        content: 'The product launched.',
        tags: ['career'],
        user_presence: 'attended',
      }),
    ]);
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
});
