import { describe, it, expect } from 'vitest';
import { normalizeName, pickSurvivor } from './romanticRelationshipDedupeService';

describe('normalizeName', () => {
  it('normalizes case, punctuation and whitespace', () => {
    expect(normalizeName('Mr. Chino')).toBe('mr chino');
    expect(normalizeName("He'll  Fairy")).toBe('he ll fairy');
    expect(normalizeName('Ashley')).toBe('ashley');
  });
});

describe('pickSurvivor', () => {
  const base = {
    person_id: 'p',
    person_type: 'character' as const,
    relationship_type: null,
    status: null,
    start_date: null,
    end_date: null,
    affection_score: null,
    emotional_intensity: null,
    metadata: null,
  };

  it('prefers the current row over an ended one', () => {
    const rows = [
      { ...base, id: 'a', is_current: false, updated_at: '2026-06-24T00:00:00Z', created_at: '2026-06-24T00:00:00Z' },
      { ...base, id: 'b', is_current: true, updated_at: '2026-06-20T00:00:00Z', created_at: '2026-06-20T00:00:00Z' },
    ];
    expect(pickSurvivor(rows).id).toBe('b');
  });

  it('prefers the most recently updated when currentness is equal', () => {
    const rows = [
      { ...base, id: 'a', is_current: false, updated_at: '2026-06-10T00:00:00Z', created_at: '2026-06-10T00:00:00Z' },
      { ...base, id: 'b', is_current: false, updated_at: '2026-06-24T00:00:00Z', created_at: '2026-06-24T00:00:00Z' },
    ];
    expect(pickSurvivor(rows).id).toBe('b');
  });
});
