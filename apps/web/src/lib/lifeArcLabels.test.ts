import { describe, expect, it } from 'vitest';

import {
  formatNarrativeStages,
  isNarrativeConsolidationArc,
} from '../../src/lib/lifeArcLabels';
import type { LifeArc } from '../../src/hooks/useLifeArcs';

function arc(overrides: Partial<LifeArc> = {}): LifeArc {
  return {
    id: 'arc-1',
    title: 'Test arc',
    arc_type: 'custom',
    track: 'inner',
    dominant_emotion: null,
    emotional_arc: 'building',
    parent_id: null,
    start_date: '2024-01-01',
    end_date: null,
    is_active: true,
    summary: 'A story',
    confidence: 0.7,
    source: 'inferred',
    tags: [],
    ...overrides,
  };
}

describe('lifeArcLabels', () => {
  it('detects narrative consolidation arcs by metadata or tag', () => {
    expect(isNarrativeConsolidationArc(arc())).toBe(false);
    expect(
      isNarrativeConsolidationArc(
        arc({ metadata: { detector: 'narrative_consolidation' } }),
      ),
    ).toBe(true);
    expect(
      isNarrativeConsolidationArc(arc({ tags: ['narrative_consolidation', 'climax'] })),
    ).toBe(true);
  });

  it('formats dominant stages from metadata', () => {
    expect(
      formatNarrativeStages(
        arc({
          metadata: { dominant_stages: ['SETUP', 'CLIMAX'] },
          tags: ['narrative_consolidation'],
        }),
      ),
    ).toEqual(['SETUP', 'CLIMAX']);
  });
});
