import { describe, expect, it } from 'vitest';
import type { StitchedTimelineItem, StitchedTimelineResult } from '../api/stitchedTimeline';
import {
  priorTimeframeWindow,
  stitchedItemToLifeArcEvent,
  stitchedResultToLifeArcData,
  timeframeWindow,
} from './lifeArcRecentFromStitched';

function item(overrides: Partial<StitchedTimelineItem> = {}): StitchedTimelineItem {
  return {
    id: 'stitched-1',
    kind: 'event',
    sourceId: 'evt-1',
    sourceIds: ['evt-1'],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: '2026-08-01T12:00:00.000Z',
    userSortIndex: null,
    title: 'Finished the first draft',
    body: 'Stayed up until 3am.',
    confidence: 0.92,
    timeConfidence: 0.92,
    occurrenceStatus: 'confirmed',
    projectionRole: 'canonical',
    tags: ['writing'],
    temporal: {
      occurred: {
        start: '2026-08-01T12:00:00.000Z',
        end: null,
        precision: 'date',
        source: 'user_stated',
        status: 'anchored',
        confidence: 0.92,
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
    ...overrides,
  };
}

function result(overrides: Partial<StitchedTimelineResult> = {}): StitchedTimelineResult {
  return {
    scope_type: 'global',
    scope_id: '00000000-0000-0000-0000-000000000000',
    scope_label: 'Your full timeline',
    items: [item()],
    has_user_order: false,
    chapter: {
      title: 'Building',
      thesis: 'A period of deliberate, intentional building.',
      dominantTheme: 'building',
      startDate: '2026-07-21',
      endDate: '2026-08-20',
      participants: ['Jordan', 'Dr. Chen'],
      locations: ['Home Office'],
      supportingEventIds: ['evt-1'],
      backgroundEventIds: [],
      backgroundContext: [],
      outcomes: [],
      contributionScores: {},
      quality: {},
      confidence: 0.8,
    },
    ...overrides,
  };
}

describe('lifeArcRecentFromStitched', () => {
  it('windows LAST_30_DAYS without inventing extra days', () => {
    const window = timeframeWindow('LAST_30_DAYS', new Date('2026-08-20T00:00:00.000Z'));
    expect(window).toEqual({ start: '2026-07-21', end: '2026-08-20', days: 30 });
    expect(priorTimeframeWindow('LAST_30_DAYS', new Date('2026-08-20T00:00:00.000Z'))).toEqual({
      start: '2026-06-21',
      end: '2026-07-21',
    });
  });

  it('preserves resolved_event ids and canonical occurred times', () => {
    const event = stitchedItemToLifeArcEvent(item());
    expect(event.id).toBe('evt-1');
    expect(event.canonicalItemId).toBe('stitched-1');
    expect(event.sourceId).toBe('evt-1');
    expect(event.sourceKind).toBe('resolved_event');
    expect(event.start_time).toBe('2026-08-01T12:00:00.000Z');
    expect(event.people).toEqual([]);
    expect(event.locations).toEqual([]);
  });

  it('keeps unresolved items out of notable moments', () => {
    const unresolved = item({
      id: 'stitched-u',
      sourceId: 'evt-u',
      sourceIds: ['evt-u'],
      title: 'The thing with Alex',
      confidence: 0.3,
      timeConfidence: 0.3,
      occurrenceStatus: 'unresolved',
      projectionRole: 'unresolved',
      temporal: {
        occurred: {
          start: null,
          end: null,
          precision: 'unknown',
          source: 'recording_fallback',
          status: 'unanchored',
          confidence: 0.2,
          expression: 'sometime recently',
          timezone: null,
        },
        mentionedAt: null,
        recordedAt: '2026-08-10T00:00:00.000Z',
        knownFrom: null,
        validFrom: null,
        validUntil: null,
        provenance: [],
      },
    });
    const data = stitchedResultToLifeArcData(
      result({
        items: [item(), unresolved],
        unresolved_items: [unresolved],
      }),
      'LAST_30_DAYS',
    );
    expect(data.event_groups.significant_events.map((event) => event.id)).toEqual(['evt-1']);
    expect(data.event_groups.unresolved_events.map((event) => event.id)).toEqual(['evt-u']);
    expect(data.event_groups.unresolved_events[0]?.confidence).toBeLessThan(0.4);
    expect(data.is_silence).toBe(false);
    expect(data.narrative_summary.text).toBe('A period of deliberate, intentional building.');
  });

  it('uses chapter participants only when they are new vs the prior window', () => {
    const data = stitchedResultToLifeArcData(
      result(),
      'LAST_30_DAYS',
      result({
        chapter: {
          title: 'Earlier',
          thesis: 'Earlier chapter',
          dominantTheme: 'earlier',
          startDate: '2026-06-21',
          endDate: '2026-07-21',
          participants: ['Jordan'],
          locations: [],
          supportingEventIds: [],
          backgroundEventIds: [],
          backgroundContext: [],
          outcomes: [],
          contributionScores: {},
          quality: {},
          confidence: 0.6,
        },
      }),
    );
    expect(data.change_signals.first_time_people.map((person) => person.name)).toEqual(['Dr. Chen']);
    expect(data.change_signals.first_time_locations.map((place) => place.name)).toEqual(['Home Office']);
  });

  it('reports silence instead of inventing moments', () => {
    const data = stitchedResultToLifeArcData(
      result({ items: [], chapter: undefined, unresolved_items: [] }),
      'LAST_7_DAYS',
    );
    expect(data.is_silence).toBe(true);
    expect(data.stability_state).toBe('STABLE_EMPTY');
    expect(data.event_groups.significant_events).toEqual([]);
    expect(data.narrative_summary.text).toMatch(/nothing notable/i);
  });

  it('groups recurring tags without fabricating labels', () => {
    const second = item({
      id: 'stitched-2',
      sourceId: 'evt-2',
      sourceIds: ['evt-2'],
      title: 'Another writing night',
      tags: ['writing'],
    });
    const data = stitchedResultToLifeArcData(result({ items: [item(), second] }), 'LAST_30_DAYS');
    expect(data.event_groups.recurring_patterns).toEqual([
      { label: 'writing', event_ids: ['evt-1', 'evt-2'], frequency: 2 },
    ]);
  });
});
