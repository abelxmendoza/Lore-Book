import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import { stitchedItemsToLocationTimelineEntries } from './locationStitchedTimelineAdapter';

describe('locationStitchedTimelineAdapter', () => {
  it('projects stitched items with canonical id and source id kept separate', () => {
    const item: StitchedTimelineItem = {
      id: 'event:evt-vanguard',
      kind: 'event',
      sourceId: 'evt-vanguard',
      sourceIds: ['evt-vanguard'],
      sourceKind: 'resolved_event',
      sourceType: 'resolved_event',
      sortTime: '2026-06-01T12:00:00.000Z',
      userSortIndex: null,
      title: 'Vanguard Robotics demo',
      body: 'Marcus presented MemoVault.',
    };
    expect(stitchedItemsToLocationTimelineEntries([item])).toEqual([
      {
        id: 'event:evt-vanguard',
        sourceId: 'evt-vanguard',
        sourceKind: 'resolved_event',
        timestamp: '2026-06-01T12:00:00.000Z',
        title: 'Vanguard Robotics demo',
        summary: 'Marcus presented MemoVault.',
      },
    ]);
  });
});
