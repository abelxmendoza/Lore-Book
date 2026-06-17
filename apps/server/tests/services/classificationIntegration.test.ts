import { describe, expect, it, vi, beforeEach } from 'vitest';

import { classificationService } from '../../src/services/ontology/classificationService';
import { DEFAULT_SWIMLANES } from '../../src/services/ontology/classificationDefaults';
import { buildOntologyMetadataAsync } from '../../src/services/ontology/ontologyEnrichmentService';
import { classifyEntity } from '../../src/services/entities/entityClassifier';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST205' } }),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST205' } }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('classificationService swimlanes', () => {
  beforeEach(() => {
    classificationService.clearSwimlaneCache();
  });

  it('falls back to default swimlanes when DB unavailable', async () => {
    const lanes = await classificationService.getSwimlanes();
    expect(lanes.map((l) => l.label)).toEqual(DEFAULT_SWIMLANES.map((l) => l.label));
  });

  it('matches robotics content to robotics lane', async () => {
    const lane = await classificationService.matchSwimlane(
      'Spent the evening tuning ROS2 nodes for the robot arm',
      []
    );
    expect(lane).toBe('robotics');
  });

  it('defaults to life when no keyword matches', async () => {
    const lane = await classificationService.matchSwimlane('Had a quiet day at home', []);
    expect(lane).toBe('life');
  });
});

describe('entityClassifier rootType', () => {
  it('returns canonical rootType alongside legacy EntityClass', () => {
    expect(classifyEntity('High Noon').rootType).toBe('FOODDRINK');
    expect(classifyEntity('Moreno Valley').rootType).toBe('LOCATION');
    expect(classifyEntity('Tio Ralph').rootType).toBe('PERSON');
    expect(classifyEntity('Blue Room').rootType).toBe('LOCATION');
    expect(classifyEntity('Blue Room').dynamicLabel).toBe('blue room');
  });
});

describe('buildOntologyMetadataAsync', () => {
  it('returns base metadata when DB unavailable', async () => {
    const meta = await buildOntologyMetadataAsync('Tio Ralph', 'my uncle Tio Ralph visited', {
      userId: 'user-1',
      rootType: 'PERSON',
    });
    expect(meta.domains).toBeDefined();
    expect(meta.dynamic_classifications ?? []).toEqual([]);
  });
});
