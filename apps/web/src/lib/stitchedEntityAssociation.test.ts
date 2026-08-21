import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import {
  partitionStitchedItemsForEntity,
  resolveStitchedEntityLink,
} from './stitchedEntityAssociation';

function item(overrides: Partial<StitchedTimelineItem> = {}): StitchedTimelineItem {
  return {
    id: 'event:evt-1',
    kind: 'event',
    sourceId: 'evt-1',
    sourceIds: ['evt-1'],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: '2026-06-01T00:00:00.000Z',
    userSortIndex: null,
    title: 'Camping trip',
    body: 'Went camping',
    ...overrides,
  };
}

describe('stitchedEntityAssociation', () => {
  it('direct entity id beats date/name heuristics', () => {
    const linked = item({
      peopleIds: ['char-marcus'],
      locationIds: ['loc-other'],
      title: 'Jamie at MemoVault',
    });
    expect(
      resolveStitchedEntityLink(linked, { id: 'char-marcus', type: 'character' }),
    ).toEqual({ associated: true, unresolved: false, reason: 'direct_entity_id' });
    expect(
      resolveStitchedEntityLink(linked, { id: 'char-jamie', type: 'character' }),
    ).toEqual({ associated: false, unresolved: false, reason: 'no_direct_entity_match' });
  });

  it('unresolved linkage stays unresolved when people/place arrays are missing', () => {
    const journal = item({
      id: 'moment:journal-1',
      kind: 'moment',
      sourceKind: 'journal_entry',
      sourceId: 'journal-1',
      title: 'Notes about Marcus',
    });
    expect(journal.peopleIds).toBeUndefined();
    expect(
      resolveStitchedEntityLink(journal, { id: 'char-marcus', type: 'character' }),
    ).toEqual({ associated: false, unresolved: true, reason: 'missing_entity_ids' });
  });

  it('does not invent association from an empty known membership list', () => {
    const knownEmpty = item({ peopleIds: [], locationIds: ['loc-hq'] });
    expect(
      resolveStitchedEntityLink(knownEmpty, { id: 'char-marcus', type: 'character' }),
    ).toEqual({ associated: false, unresolved: false, reason: 'no_direct_entity_match' });
  });

  it('partitions matched vs unresolved vs excluded', () => {
    const { matched, unresolved, excluded } = partitionStitchedItemsForEntity(
      [
        item({ peopleIds: ['char-marcus'] }),
        item({ id: 'moment:j', sourceKind: 'journal_entry', sourceId: 'j' }),
        item({ id: 'event:evt-2', sourceId: 'evt-2', peopleIds: ['char-jamie'] }),
      ],
      { id: 'char-marcus', type: 'character' },
    );
    expect(matched.map((row) => row.sourceId)).toEqual(['evt-1']);
    expect(unresolved.map((row) => row.sourceId)).toEqual(['j']);
    expect(excluded.map((row) => row.sourceId)).toEqual(['evt-2']);
  });
});
