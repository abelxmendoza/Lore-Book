import { describe, expect, it } from 'vitest';
import { stitchedIsFuture, stitchedOccurredStart } from './stitchedOccurrence';
import type { StitchedTimelineItem } from './stitchedTimelineService';

function item(overrides: Partial<StitchedTimelineItem>): StitchedTimelineItem {
  return {
    id: 'event:evt-1',
    kind: 'event',
    sourceId: 'evt-1',
    sortTime: '2026-07-12T19:30:00.000Z',
    title: 'Dinner with Maya',
    body: '',
    sourceKind: 'resolved_event',
    sourceIds: ['evt-1'],
    sourceType: 'resolved_event',
    tags: [],
    confidence: 0.9,
    timePrecision: 'minute',
    timeConfidence: 0.9,
    ...overrides,
  } as StitchedTimelineItem;
}

describe('stitchedOccurredStart', () => {
  it('returns canonical occurredStart and ignores unresolved / missing dates', () => {
    expect(stitchedOccurredStart(item({
      occurredAt: '2026-07-12T19:30:00.000Z',
      occurrenceStatus: 'point',
      temporalProjection: { isUnresolved: false, occurredStart: '2026-07-12T19:30:00.000Z' } as never,
    }))).toBe('2026-07-12T19:30:00.000Z');

    expect(stitchedOccurredStart(item({
      occurredAt: null,
      occurrenceStatus: 'unresolved',
      temporalProjection: { isUnresolved: true, occurredStart: null } as never,
    }))).toBeNull();
  });
});

describe('stitchedIsFuture', () => {
  it('requires a grounded occurrence, not a compatibility date', () => {
    expect(stitchedIsFuture(item({
      occurredAt: '2030-01-01T19:00:00.000Z',
      occurrenceStatus: 'point',
      temporalProjection: {
        isUnresolved: false,
        temporalState: 'future',
        occurredStart: '2030-01-01T19:00:00.000Z',
      } as never,
    }))).toBe(true);

    expect(stitchedIsFuture(item({
      occurredAt: null,
      occurrenceStatus: 'unresolved',
      temporalProjection: {
        isUnresolved: true,
        temporalState: 'unresolved',
        occurredStart: null,
      } as never,
    }))).toBe(false);
  });
});
