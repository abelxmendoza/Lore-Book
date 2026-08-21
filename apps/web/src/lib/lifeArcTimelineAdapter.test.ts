import { describe, expect, it } from 'vitest';
import type { LifeArc } from '../hooks/useLifeArcs';
import {
  associatedLifeArcs,
  lifeArcToTimelineContainer,
  lifeArcTypeToTimelineType,
  searchLifeArcs,
} from './lifeArcTimelineAdapter';

function arc(overrides: Partial<LifeArc> = {}): LifeArc {
  return {
    id: 'arc-college',
    title: 'College years',
    arc_type: 'life_era',
    track: 'inner',
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: '2012-09-01',
    end_date: '2016-06-01',
    is_active: false,
    summary: 'Undergraduate stretch with Marcus',
    confidence: 0.8,
    source: 'inferred',
    tags: ['school'],
    ...overrides,
  };
}

describe('lifeArcTimelineAdapter', () => {
  it('keeps life_arc ids and maps occasion to custom', () => {
    const container = lifeArcToTimelineContainer(arc({ id: 'keep-me', arc_type: 'occasion' }));
    expect(container.id).toBe('keep-me');
    expect(container.timeline_type).toBe('custom');
    expect(lifeArcTypeToTimelineType('life_era')).toBe('life_era');
  });

  it('prefers membership ids over other signals', () => {
    const membership = arc({ id: 'arc-member', start_date: '1999-01-01', end_date: '1999-02-01' });
    const overlapping = arc({ id: 'arc-overlap' });
    const matched = associatedLifeArcs([membership, overlapping], {
      membershipIds: ['arc-member'],
      occurredStart: '2014-01-01',
    });
    expect(matched.map((item) => item.id)).toEqual(['arc-member']);
  });

  it('uses source_event_ids, then direct entity ids, and does not invent from date or name', () => {
    const bySource = arc({
      id: 'arc-source',
      metadata: { source_event_ids: ['evt-1'] },
      start_date: null,
      end_date: null,
    });
    const byDate = arc({ id: 'arc-date' });
    const byName = arc({ id: 'arc-name', title: 'Marcus at Vanguard Robotics' });
    expect(
      associatedLifeArcs([bySource, byDate], { sourceId: 'evt-1' }).map((item) => item.id),
    ).toEqual(['arc-source']);
    expect(
      associatedLifeArcs([byDate], { occurredStart: '2014-03-01' }).map((item) => item.id),
    ).toEqual([]);
    expect(
      associatedLifeArcs([byName], { entityName: 'Marcus' }).map((item) => item.id),
    ).toEqual([]);
    expect(associatedLifeArcs([byDate], { sourceId: 'unknown-event' })).toEqual([]);
  });

  it('direct entity ids outrank date/name heuristics and stay unresolved without them', () => {
    const byEntity = arc({
      id: 'arc-entity',
      metadata: { location_ids: ['loc-hq'] },
      start_date: '2014-01-01',
      end_date: '2014-12-01',
      title: 'MemoVault HQ years',
    });
    const byDate = arc({ id: 'arc-date', start_date: '2014-01-01', end_date: '2014-12-01' });
    expect(
      associatedLifeArcs([byEntity, byDate], { entityIds: ['loc-hq'], occurredStart: '2014-06-01' }).map(
        (item) => item.id,
      ),
    ).toEqual(['arc-entity']);
    expect(
      associatedLifeArcs([byDate], { entityIds: ['loc-hq'] }),
    ).toEqual([]);
  });

  it('searches title, type, and tags without creating new containers', () => {
    const found = searchLifeArcs(
      [arc(), arc({ id: 'arc-work', title: 'Vanguard Robotics', arc_type: 'work', tags: [] })],
      'college',
    );
    expect(found.map((item) => item.id)).toEqual(['arc-college']);
    expect(searchLifeArcs([arc()], '   ')).toEqual([]);
  });
});
