import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractRelationshipFeatures } from './relationshipFeatures';
import * as timeUtils from './timeUtils';

vi.mock('./timeUtils', () => ({
  daysBetween: vi.fn((a: string, _b: Date) => {
    const t = new Date(a).getTime();
    const now = Date.now();
    return Math.floor((now - t) / (24 * 60 * 60 * 1000));
  }),
}));

describe('relationshipFeatures', () => {
  beforeEach(() => {
    vi.mocked(timeUtils.daysBetween).mockImplementation((a: string | Date, b: string | Date) => {
      const da = typeof a === 'string' ? new Date(a).getTime() : a.getTime();
      const db = typeof b === 'string' ? new Date(b).getTime() : b.getTime();
      return Math.floor((db - da) / (24 * 60 * 60 * 1000));
    });
  });

  describe('extractRelationshipFeatures', () => {
    it('returns all features for a full edge', () => {
      const edge = {
        relationship_type: 'FRIEND_OF',
        scope: 'work',
        phase: 'ACTIVE',
        confidence: 0.8,
        start_time: '2024-01-01T00:00:00Z',
        last_evidence_at: '2024-06-15T12:00:00Z',
        evidence_source_ids: ['a', 'b', 'c'],
      };
      const f = extractRelationshipFeatures(edge);
      expect(f.relationship_type).toBe('FRIEND_OF');
      expect(f.scope).toBe('work');
      expect(f.phase).toBe('ACTIVE');
      expect(f.confidence).toBe(0.8);
      expect(typeof f.age_days).toBe('number');
      expect(typeof f.recency_days).toBe('number');
      expect(f.evidence_count).toBe(3);
    });

    it('uses global when scope is null', () => {
      const f = extractRelationshipFeatures({
        relationship_type: 'FRIEND_OF',
        scope: null,
        phase: 'CORE',
        confidence: 0.9,
        start_time: null,
        last_evidence_at: null,
        evidence_source_ids: null,
      });
      expect(f.scope).toBe('global');
      expect(f.age_days).toBeNull();
      expect(f.recency_days).toBeNull();
      expect(f.evidence_count).toBe(0);
    });

    it('handles empty evidence_source_ids', () => {
      const f = extractRelationshipFeatures({
        relationship_type: 'WORKS_FOR',
        phase: 'WEAK',
        confidence: 0.5,
        start_time: '2024-01-01',
        evidence_source_ids: [],
      });
      expect(f.evidence_count).toBe(0);
    });
  });
});
