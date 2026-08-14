import { describe, expect, it } from 'vitest';

import {
  buildHistoricalNeighborhoods,
  inferHistoricalTrack,
} from '../../../src/services/chronologyV2/temporalParallelProjection';
import type { StitchedTimelineItem } from '../../../src/services/chronologyV2/stitchedTimelineService';
import { stitchTimelineFromMessage } from '../../../src/services/timeline/timelineStitchingService';

const USER = 'user-temporal-parallelism';

function stitch(text: string) {
  return stitchTimelineFromMessage({ text, userId: USER, sourceMessageId: 'message-2015' });
}

function item(input: { id: string; title: string; body: string; start: string; end?: string }): StitchedTimelineItem {
  return {
    id: input.id, kind: 'event', sourceId: input.id, sortTime: input.start,
    userSortIndex: null, title: input.title, body: input.body,
    sourceKind: 'resolved_event', sourceIds: [input.id], sourceType: 'chat',
    occurredAt: input.start,
    temporal: {
      occurred: {
        start: input.start, end: input.end ?? null, timezone: null, precision: 'year',
        source: 'user_stated', status: input.end ? 'approximate' : 'anchored',
        confidence: 0.9, expression: null,
      },
      mentionedAt: null, recordedAt: null, knownFrom: 'message-2015',
      validFrom: null, validUntil: null,
      provenance: [{ field: 'occurred_at', source: 'chat', sourceId: 'message-2015' }],
    },
  };
}

describe('temporal parallelism and chronological reconstruction', () => {
  it('keeps a stated year as year precision with year bounds', () => {
    const result = stitch('Johnny got me to go back to martial arts in 2015.');
    const anchor = result.anchors.find((candidate) => candidate.phrase === '2015');
    expect(anchor?.normalizedTime).toMatchObject({
      precision: 'year', startDate: '2015-01-01T00:00:00.000Z',
      endDate: '2015-12-31T23:59:59.999Z',
    });
    expect(anchor?.attachedToLabel).toBe('Johnny Esparza');
  });

  it('marks around 2015 approximate instead of inventing a day', () => {
    const anchor = stitch('Johnny brought me back to training around 2015.').anchors[0];
    expect(anchor.normalizedTime?.precision).toBe('approximate');
    expect(anchor.normalizedTime?.relativeLabel).toBe('around 2015');
    expect(anchor.normalizedTime?.date).toBeUndefined();
  });

  it('preserves 2015–2019 as one relationship range', () => {
    const anchor = stitch('I was in a relationship with Kiley from 2015–2019.').anchors[0];
    expect(anchor.attachedToLabel).toBe('Kiley Tafur');
    expect(anchor.normalizedTime).toMatchObject({
      startDate: '2015-01-01T00:00:00.000Z', endDate: '2019-12-31T23:59:59.999Z', precision: 'year',
    });
  });

  it('stores age 17–18 as relative extent without calendar dates', () => {
    const anchor = stitch('I trained with Kru Valdez at ages 17–18 and went 6-0.').anchors[0];
    expect(anchor.attachedToLabel).toBe('Kru Valdez');
    expect(anchor.normalizedTime).toMatchObject({ precision: 'relative', startHint: 'age 17', endHint: 'age 18' });
    expect(anchor.normalizedTime?.startDate).toBeUndefined();
    expect(anchor.normalizedTime?.endDate).toBeUndefined();
  });

  it('extracts BEFORE and STARTS_NEAR from right before', () => {
    const result = stitch('I joined Tillis BJJ/MMA right before I got with Kiley. We were together from 2015–2019.');
    expect(result.temporalRelations.map((relation) => relation.relation)).toEqual(['BEFORE', 'STARTS_NEAR']);
    expect(result.temporalRelations[0]).toMatchObject({
      source: { attachedToLabel: 'Tillis BJJ/MMA', attachedToType: 'place_visit' },
      target: { attachedToLabel: 'Kiley Tafur', attachedToType: 'relationship_arc' },
      sourceMessageId: 'message-2015',
      sourceAssertionIds: [],
    });
  });

  it('does not infer an ordering edge from mere enumeration', () => {
    expect(stitch('In 2015 I trained at Tillis BJJ/MMA and dated Kiley.').temporalRelations).toEqual([]);
  });

  it('classifies martial arts and relationships into separate tracks', () => {
    expect(inferHistoricalTrack(item({ id: 'tillis', title: 'Tillis BJJ/MMA period', body: 'Training under Noah Tillis', start: '2015-01-01T00:00:00.000Z' }))).toMatchObject({ id: 'martial_arts' });
    expect(inferHistoricalTrack(item({ id: 'kiley', title: 'Relationship with Kiley', body: 'Dating from 2015 to 2019', start: '2015-01-01T00:00:00.000Z' }))).toMatchObject({ id: 'relationships' });
  });

  it('renders the 2015 martial arts and relationship stories in parallel', () => {
    const neighborhoods = buildHistoricalNeighborhoods([
      item({ id: 'tillis', title: 'Tillis BJJ/MMA period', body: 'Martial arts training', start: '2015-01-01T00:00:00.000Z', end: '2017-12-31T23:59:59.999Z' }),
      item({ id: 'kiley', title: 'Relationship with Kiley', body: 'Dating relationship', start: '2015-01-01T00:00:00.000Z', end: '2019-12-31T23:59:59.999Z' }),
    ]);
    expect(neighborhoods.find((n) => n.label === '2015')?.tracks.map((track) => track.id)).toEqual(['martial_arts', 'relationships']);
  });

  it('projects a multi-year extent into every intersecting historical neighborhood', () => {
    const neighborhoods = buildHistoricalNeighborhoods([
      item({ id: 'kiley', title: 'Relationship with Kiley', body: 'Dating relationship', start: '2015-01-01T00:00:00.000Z', end: '2019-12-31T23:59:59.999Z' }),
    ]);
    expect(neighborhoods.map((n) => n.label)).toEqual(['2015', '2016', '2017', '2018', '2019']);
  });

  it('keeps temporal relation provenance in the historical projection', () => {
    const items = [
      item({ id: 'tillis', title: 'Tillis BJJ/MMA', body: 'Martial arts training', start: '2015-01-01T00:00:00.000Z' }),
      item({ id: 'kiley', title: 'Kiley Tafur', body: 'Dating relationship', start: '2015-01-01T00:00:00.000Z' }),
    ];
    const neighborhoods = buildHistoricalNeighborhoods(items, [{
      id: 'relation-1', sourceId: 'tillis', sourceLabel: 'Tillis BJJ/MMA',
      targetId: 'kiley', targetLabel: 'Kiley Tafur', relation: 'STARTS_NEAR', confidence: 0.9,
      evidencePhrase: 'joined right before I got with Kiley', sourceMessageId: 'message-2015',
      sourceAssertionIds: [],
    }]);
    expect(neighborhoods[0].relationIds).toEqual(['relation-1']);
  });
});
