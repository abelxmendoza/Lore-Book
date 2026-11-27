import { describe, expect, it } from 'vitest';

import type { LifeArc } from '../hooks/useLifeArcs';
import {
  defaultPromotionType,
  duplicateOccasionGroups,
  multiDayOccasionCandidates,
} from './lifeArcRepairCandidates';

function arc(overrides: Partial<LifeArc>): LifeArc {
  return {
    id: 'arc-1',
    title: 'Sample',
    arc_type: 'occasion',
    track: null,
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: '2025-01-01',
    end_date: '2025-01-01',
    is_active: false,
    summary: null,
    confidence: 0.5,
    source: 'inferred',
    tags: [],
    ...overrides,
  };
}

describe('lifeArcRepairCandidates', () => {
  it('finds multi-day occasions that can become bars', () => {
    const candidates = multiDayOccasionCandidates([
      arc({ id: 'one-day', end_date: '2025-01-01' }),
      arc({ id: 'chapter', title: 'Vanguard chapter', start_date: '2025-01-01', end_date: '2025-06-01', track: 'career' }),
      arc({ id: 'work', arc_type: 'work', start_date: '2024-01-01', end_date: '2024-12-01' }),
    ]);
    expect(candidates.map((item) => item.id)).toEqual(['chapter']);
    expect(defaultPromotionType(candidates[0]!)).toBe('work');
  });

  it('groups duplicate same-day occasions', () => {
    const groups = duplicateOccasionGroups([
      arc({ id: 'a', title: 'Northwind Meetup', start_date: '2025-03-01', metadata: { occasion_day: '2025-03-01' } }),
      arc({ id: 'b', title: 'Northwind Meetup', start_date: '2025-03-01', metadata: { occasion_day: '2025-03-01' } }),
      arc({ id: 'c', title: 'Other day', start_date: '2025-03-02' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.arcs.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
