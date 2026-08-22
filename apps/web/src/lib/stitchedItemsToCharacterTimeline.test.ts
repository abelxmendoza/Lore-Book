import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import { stitchedItemsToCharacterTimeline } from './stitchedItemsToCharacterTimeline';

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

describe('stitchedItemsToCharacterTimeline', () => {
  it('maps attended presence onto the shared (with you) lane', () => {
    const mapped = stitchedItemsToCharacterTimeline([
      item({
        id: 'event:evt-vanguard',
        sourceId: 'evt-vanguard',
        sourceKind: 'resolved_event',
        title: 'Vanguard Robotics demo',
        body: 'Marcus presented MemoVault.',
        userPresence: 'attended',
      }),
    ]);
    expect(mapped.sharedExperiences).toEqual([
      expect.objectContaining({
        id: 'event:evt-vanguard',
        eventId: 'evt-vanguard',
        sourceId: 'evt-vanguard',
        sourceKind: 'resolved_event',
        eventTitle: 'Vanguard Robotics demo',
        userWasPresent: true,
        userPresence: 'attended',
      }),
    ]);
    expect(mapped.lore).toEqual([]);
  });

  it('maps heard_about and unknown presence onto the lore (without you) lane', () => {
    const mapped = stitchedItemsToCharacterTimeline([
      item({
        id: 'event:evt-heard',
        sourceId: 'evt-heard',
        sourceKind: 'resolved_event',
        title: 'Jamie finished the degree',
        userPresence: 'heard_about',
      }),
      item({
        id: 'event:evt-unknown',
        sourceId: 'evt-unknown',
        sourceKind: 'resolved_event',
        title: 'MemoVault kickoff',
        userPresence: 'unknown',
      }),
    ]);
    expect(mapped.sharedExperiences).toEqual([]);
    expect(mapped.lore.map((row) => row.eventTitle)).toEqual([
      'Jamie finished the degree',
      'MemoVault kickoff',
    ]);
    expect(mapped.lore.every((row) => row.userWasPresent === false)).toBe(true);
  });

  it('treats missing userPresence as lore, not as a shared experience', () => {
    const mapped = stitchedItemsToCharacterTimeline([
      item({
        id: 'event:evt-missing',
        sourceId: 'evt-missing',
        sourceKind: 'resolved_event',
        title: 'Unspecified presence',
      }),
    ]);
    expect(mapped.sharedExperiences).toEqual([]);
    expect(mapped.lore[0]?.userPresence).toBe('unknown');
  });

  it('keeps canonical item id and source id separate', () => {
    const mapped = stitchedItemsToCharacterTimeline([
      item({
        id: 'event:evt-vanguard',
        sourceId: 'evt-vanguard',
        sourceKind: 'resolved_event',
        title: 'Vanguard Robotics demo',
        userPresence: 'attended',
      }),
    ]);
    expect(mapped.sharedExperiences[0]?.id).toBe('event:evt-vanguard');
    expect(mapped.sharedExperiences[0]?.sourceId).toBe('evt-vanguard');
    expect(mapped.sharedExperiences[0]?.eventId).toBe('evt-vanguard');
  });

  it('returns empty lanes for empty stitched input instead of inventing rows', () => {
    expect(stitchedItemsToCharacterTimeline([])).toEqual({
      sharedExperiences: [],
      lore: [],
    });
  });
});
