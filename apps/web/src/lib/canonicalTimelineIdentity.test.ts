import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import { stitchedItemsToLocationTimelineEntries } from './locationStitchedTimelineAdapter';
import { stitchedItemToLifeArcEvent } from './lifeArcRecentFromStitched';
import { stitchedItemsToChronology } from './unifiedTimeline';
import { resolveTimelineItemDetail } from './resolveTimelineItemDetail';

const CANONICAL: StitchedTimelineItem = {
  id: 'event:evt-vanguard',
  kind: 'event',
  sourceId: 'evt-vanguard',
  sourceIds: ['evt-vanguard'],
  sourceKind: 'resolved_event',
  sourceType: 'resolved_event',
  sortTime: '2026-06-01T12:00:00.000Z',
  userSortIndex: null,
  title: 'Vanguard Robotics demo',
  body: 'Marcus and Jamie presented MemoVault.',
  peopleIds: ['char-marcus'],
  locationIds: ['loc-novara-hq'],
  temporal: {
    occurred: {
      start: '2026-06-01T12:00:00.000Z',
      end: null,
      precision: 'date',
      source: 'user_stated',
      status: 'anchored',
      confidence: 0.9,
      expression: null,
      timezone: null,
    },
    mentionedAt: null,
    recordedAt: null,
    knownFrom: null,
    validFrom: null,
    validUntil: null,
    provenance: [],
  },
};

describe('canonical timeline identity across surfaces', () => {
  it('keeps the same canonical item id, source id, and occurred date in Omni, Calendar, Character, and Location projections', () => {
    const [omni] = stitchedItemsToChronology([CANONICAL]);
    const lifeArc = stitchedItemToLifeArcEvent(CANONICAL);
    const [location] = stitchedItemsToLocationTimelineEntries([CANONICAL]);
    const calendar = {
      id: CANONICAL.id,
      kind: CANONICAL.kind,
      sourceKind: CANONICAL.sourceKind,
      sourceId: CANONICAL.sourceId,
      sortTime: CANONICAL.sortTime,
      title: CANONICAL.title,
    };
    const omniDetail = resolveTimelineItemDetail({
      id: omni.id,
      sourceKind: omni.source_kind,
      sourceId: omni.source_id,
    });
    const characterDetail = resolveTimelineItemDetail(lifeArc);
    const locationDetail = resolveTimelineItemDetail(location);
    const calendarDetail = resolveTimelineItemDetail(calendar);

    const occurred = '2026-06-01T12:00:00.000Z';
    expect(omni.source_id).toBe('evt-vanguard');
    expect(omni.id).toBe('event:evt-vanguard');
    expect(omni.start_time).toBe(occurred);

    expect(lifeArc.sourceId).toBe('evt-vanguard');
    expect(lifeArc.canonicalItemId).toBe('event:evt-vanguard');
    expect(lifeArc.start_time).toBe(occurred);

    expect(location.sourceId).toBe('evt-vanguard');
    expect(location.id).toBe('event:evt-vanguard');
    expect(location.timestamp).toBe(occurred);

    expect(calendar.sourceId).toBe('evt-vanguard');
    expect(calendarDetail.sourceId).toBe('evt-vanguard');
    expect([omniDetail, characterDetail, locationDetail, calendarDetail].map((row) => row.route)).toEqual([
      'event',
      'event',
      'event',
      'event',
    ]);
    expect([omniDetail, characterDetail, locationDetail, calendarDetail].map((row) => row.canonicalItemId)).toEqual([
      'event:evt-vanguard',
      'event:evt-vanguard',
      'event:evt-vanguard',
      'event:evt-vanguard',
    ]);
  });
});
