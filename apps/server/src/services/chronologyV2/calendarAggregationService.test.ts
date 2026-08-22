import { describe, expect, it } from 'vitest';

import type { StitchedTimelineItem } from './stitchedTimelineService';
import { buildCalendarMonthFromStitched } from './calendarAggregationService';

const LA = 'America/Los_Angeles';
const NOW = new Date('2026-08-20T17:00:00Z');

function stitched(over: Partial<StitchedTimelineItem> & Pick<StitchedTimelineItem, 'id'>): StitchedTimelineItem {
  return {
    kind: 'event',
    sourceId: over.id.replace(/^event:/, ''),
    sourceIds: [over.id.replace(/^event:/, '')],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: '2026-08-20T12:00:00.000Z',
    userSortIndex: null,
    title: 'Event',
    body: '',
    timePrecision: 'date',
    occurrenceStatus: 'confirmed',
    occurredAt: '2026-08-20T12:00:00.000Z',
    ...over,
  };
}

describe('buildCalendarMonthFromStitched', () => {
  it('places a UTC midnight-boundary event on the user-local day', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:boundary',
          occurredAt: '2026-08-20T02:30:00.000Z',
          timePrecision: 'exact',
          temporal: {
            occurred: {
              start: '2026-08-20T02:30:00.000Z', end: null, timezone: null,
              precision: 'exact', source: 'user_stated', status: 'anchored',
              confidence: 0.9, expression: '7:30 PM',
            },
            mentionedAt: null, recordedAt: null, knownFrom: null,
            validFrom: null, validUntil: null, provenance: [],
          },
        }),
      ],
    });
    const daysWith = month.days.filter((day) => day.items.some((item) => item.canonicalItemId === 'event:boundary'));
    expect(daysWith).toHaveLength(1);
    expect(daysWith[0]?.date).toBe('2026-08-19');
    expect(daysWith[0]?.items[0]?.isTimed).toBe(true);
    expect(daysWith[0]?.items[0]?.id).toBe('event:boundary');
  });

  it('does not drop a multi-day range and keeps a single canonical id', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:trip',
          occurrenceStatus: 'range',
          occurredAt: '2026-08-19T16:00:00.000Z',
          occurredEnd: '2026-08-21T20:00:00.000Z',
        }),
      ],
    });
    const ids = month.days.flatMap((day) => day.items.map((item) => item.canonicalItemId));
    expect(ids.filter((id) => id === 'event:trip')).toHaveLength(1);
    const trip = month.days.flatMap((day) => day.items).find((item) => item.id === 'event:trip');
    expect(trip?.isRange).toBe(true);
    expect(trip?.userLocalStartDay).toBe('2026-08-19');
    expect(trip?.userLocalEndDay).toBe('2026-08-21');
  });

  it('keeps unresolved items in unscheduled without a fake day', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [],
      unresolvedItems: [
        stitched({
          id: 'event:unknown',
          occurrenceStatus: 'unresolved',
          projectionRole: 'unresolved',
          timePrecision: 'unknown',
          occurredAt: null,
          sortTime: '1970-01-01T00:00:00.000Z',
        }),
      ],
    });
    expect(month.days.every((day) => day.items.every((item) => item.id !== 'event:unknown'))).toBe(true);
    expect(month.unscheduledItems.map((item) => item.canonicalItemId)).toEqual(['event:unknown']);
    expect(month.unscheduledItems[0]?.userLocalStartDay).toBeNull();
  });

  it('does not let arc_event_links.sort_time change the occurrence day', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:sorted',
          sourceIds: ['evt-1'],
          occurredAt: '2026-08-10T18:00:00.000Z',
          sortTime: '2026-08-10T18:00:00.000Z',
        }),
      ],
      links: [{
        arc_id: 'arc-1',
        resolved_event_id: 'evt-1',
        journal_entry_id: null,
        user_presence: 'attended',
        temporal_role: 'during',
        sort_time: '2026-08-15T18:00:00.000Z',
      }],
    });
    const placed = month.days.flatMap((day) => day.items).find((item) => item.id === 'event:sorted');
    expect(placed?.userLocalStartDay).toBe('2026-08-10');
    expect(placed?.sortTime).toBe('2026-08-15T18:00:00.000Z');
    expect(month.days.find((day) => day.date === '2026-08-15')?.items.some((item) => item.id === 'event:sorted')).toBeFalsy();
  });

  it('includes a local September item whose UTC timestamp is October', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 9,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:late-sep',
          timePrecision: 'exact',
          occurredAt: '2026-10-01T06:30:00.000Z',
        }),
      ],
    });
    const placed = month.days.flatMap((day) => day.items).find((item) => item.id === 'event:late-sep');
    expect(placed?.userLocalStartDay).toBe('2026-09-30');
    expect(month.days.some((day) => day.date === '2026-09-30' && day.items.some((item) => item.id === 'event:late-sep'))).toBe(true);
  });

  it('16. tenant isolation: each feed only sees its own items', () => {
    const userA = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [stitched({ id: 'event:shared-shape', title: 'A' })],
    });
    const userB = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [stitched({ id: 'event:shared-shape', title: 'B' })],
    });
    expect(userA.days.flatMap((day) => day.items).map((item) => item.title)).toEqual(['A']);
    expect(userB.days.flatMap((day) => day.items).map((item) => item.title)).toEqual(['B']);
  });

  it('places an ongoing period once in the viewed month without cloning days', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:job',
          occurrenceStatus: 'range',
          occurredAt: '2025-01-15T16:00:00.000Z',
          occurredEnd: null,
          validFrom: '2025-01-15T16:00:00.000Z',
          validUntil: null,
        }),
      ],
    });
    const matches = month.days.flatMap((day) => day.items).filter((item) => item.id === 'event:job');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.temporalState).toBe('ongoing');
    expect(matches[0]?.isRange).toBe(true);
    expect(matches[0]?.occurredEnd).toBeNull();
  });

  it('preserves canonicalEventType and tags for shared filters', () => {
    const month = buildCalendarMonthFromStitched({
      year: 2026,
      month: 8,
      timezone: LA,
      now: NOW,
      stitchedItems: [
        stitched({
          id: 'event:career',
          tags: ['career'],
          canonicalEventType: 'career_milestone',
          occurredAt: '2026-08-12T18:00:00.000Z',
        }),
      ],
    });
    const item = month.days.flatMap((day) => day.items).find((row) => row.id === 'event:career');
    expect(item?.tags).toEqual(['career']);
    expect(item?.canonicalEventType).toBe('career_milestone');
  });
});
