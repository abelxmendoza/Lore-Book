import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/openai', () => ({
  tracedCompletion: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./arcService', () => ({
  arcService: { upsert: vi.fn() },
}));

vi.mock('./arcMembershipService', () => ({
  arcMembershipService: {},
}));

vi.mock('./arcRelationshipService', () => ({
  arcRelationshipService: {},
}));

import { inferTrack, type RawCandidate } from './arcInferenceService';

function candidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    id: 'candidate-1',
    canonical_title: 'A recurring part of life',
    dominant_entity_names: [],
    recurring_activities: [],
    occurrence_count: 3,
    continuity_strength: 0.8,
    first_seen_at: '2026-01-01',
    last_seen_at: '2026-03-01',
    ...overrides,
  };
}

describe('inferTrack', () => {
  it('routes romantic partners and dating arcs to Love & Dating', () => {
    expect(inferTrack(candidate({ dominant_entity_names: ['boyfriend'] }), 'life_era')).toBe('romance');
    expect(inferTrack(candidate({ canonical_title: 'Dating after the breakup' }), 'life_era')).toBe('romance');
  });

  it('keeps family and friendship arcs in Relationships', () => {
    expect(inferTrack(candidate({ dominant_entity_names: ['best friend'] }), 'life_era')).toBe('relationships');
    expect(inferTrack(candidate({ canonical_title: 'Time with family' }), 'life_era')).toBe('relationships');
  });

  it('does not treat an ordinary calendar date as romance', () => {
    expect(inferTrack(candidate({ canonical_title: 'Project date moved to Friday' }), 'life_era')).toBe('inner');
  });
});
