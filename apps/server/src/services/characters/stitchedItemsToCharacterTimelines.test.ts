import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedItemsToCharacterTimelines } from './stitchedItemsToCharacterTimelines';

function item(
  overrides: Partial<StitchedTimelineItem> & Pick<StitchedTimelineItem, 'id' | 'sourceId' | 'sourceKind' | 'title'>,
): StitchedTimelineItem {
  return {
    kind: overrides.sourceKind === 'journal_entry' ? 'moment' : 'event',
    sourceIds: [overrides.sourceId],
    sourceType: overrides.sourceKind,
    sortTime: '2026-06-01T12:00:00.000Z',
    userSortIndex: null,
    body: '',
    ...overrides,
  };
}

describe('stitchedItemsToCharacterTimelines', () => {
  it('splits attended vs heard_about into sharedExperiences vs lore', () => {
    const mapped = stitchedItemsToCharacterTimelines([
      item({
        id: 'event:evt-vanguard',
        sourceId: 'evt-vanguard',
        sourceKind: 'resolved_event',
        title: 'Vanguard Robotics demo',
        userPresence: 'attended',
      }),
      item({
        id: 'event:evt-degree',
        sourceId: 'evt-degree',
        sourceKind: 'resolved_event',
        title: 'Jamie finished the degree',
        userPresence: 'heard_about',
      }),
    ]);
    expect(mapped.sharedExperiences.map((row) => row.sourceId)).toEqual(['evt-vanguard']);
    expect(mapped.lore.map((row) => row.sourceId)).toEqual(['evt-degree']);
    expect(mapped.summary.sharedCount).toBe(1);
    expect(mapped.summary.loreCount).toBe(1);
  });

  it('returns empty lanes when stitched chronology has no character matches', () => {
    expect(stitchedItemsToCharacterTimelines([])).toEqual({
      sharedExperiences: [],
      lore: [],
      summary: { sharedCount: 0, loreCount: 0, recent: [] },
    });
  });
});
