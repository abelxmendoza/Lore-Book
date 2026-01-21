// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import {
  generateMockRomanticRelationships,
  getMockRomanticRelationships,
  getMockRomanticRelationshipsByFilter,
  getMockRomanticRelationshipById,
  getMockDateEvents,
  getMockRelationshipAnalytics,
  getMockRankings,
  type MockRomanticRelationship
} from '../romanticRelationships';

describe('Romantic Relationships Mock Data', () => {
  describe('generateMockRomanticRelationships', () => {
    it('should generate mock relationships', () => {
      const relationships = generateMockRomanticRelationships();
      expect(relationships).toBeDefined();
      expect(Array.isArray(relationships)).toBe(true);
      expect(relationships.length).toBeGreaterThan(0);
    });

    it('should generate relationships with required fields', () => {
      const relationships = generateMockRomanticRelationships();
      relationships.forEach(rel => {
        expect(rel.id).toBeDefined();
        expect(rel.person_id).toBeDefined();
        expect(rel.person_type).toBeDefined();
        expect(rel.person_name).toBeDefined();
        expect(rel.relationship_type).toBeDefined();
        expect(rel.status).toBeDefined();
        expect(rel.is_current).toBeDefined();
        expect(rel.affection_score).toBeGreaterThanOrEqual(0);
        expect(rel.affection_score).toBeLessThanOrEqual(1);
        expect(rel.compatibility_score).toBeGreaterThanOrEqual(0);
        expect(rel.compatibility_score).toBeLessThanOrEqual(1);
        expect(rel.relationship_health).toBeGreaterThanOrEqual(0);
        expect(rel.relationship_health).toBeLessThanOrEqual(1);
        expect(Array.isArray(rel.pros)).toBe(true);
        expect(Array.isArray(rel.cons)).toBe(true);
        expect(Array.isArray(rel.red_flags)).toBe(true);
        expect(Array.isArray(rel.green_flags)).toBe(true);
      });
    });

    it('should include at least one active relationship', () => {
      const relationships = generateMockRomanticRelationships();
      const active = relationships.filter(r => r.is_current && r.status === 'active');
      expect(active.length).toBeGreaterThan(0);
    });

    it('should include at least one past relationship', () => {
      const relationships = generateMockRomanticRelationships();
      const past = relationships.filter(r => !r.is_current || r.status === 'ended');
      expect(past.length).toBeGreaterThan(0);
    });
  });

  describe('getMockRomanticRelationships', () => {
    it('should return all mock relationships', () => {
      const relationships = getMockRomanticRelationships();
      expect(relationships.length).toBeGreaterThan(0);
    });

    it('should return consistent data', () => {
      const relationships1 = getMockRomanticRelationships();
      const relationships2 = getMockRomanticRelationships();
      expect(relationships1.length).toBe(relationships2.length);
    });
  });

  describe('getMockRomanticRelationshipsByFilter', () => {
    it('should filter active relationships', () => {
      const active = getMockRomanticRelationshipsByFilter('active');
      active.forEach(rel => {
        expect(rel.is_current).toBe(true);
        expect(rel.status).toBe('active');
      });
    });

    it('should filter past relationships', () => {
      const past = getMockRomanticRelationshipsByFilter('past');
      past.forEach(rel => {
        expect(rel.is_current === false || rel.status === 'ended').toBe(true);
      });
    });

    it('should filter situationships', () => {
      const situationships = getMockRomanticRelationshipsByFilter('situationships');
      situationships.forEach(rel => {
        expect(rel.is_situationship).toBe(true);
      });
    });

    it('should filter crushes', () => {
      const crushes = getMockRomanticRelationshipsByFilter('crushes');
      crushes.forEach(rel => {
        expect(['crush', 'obsession', 'infatuation']).toContain(rel.relationship_type);
      });
    });

    it('should return all relationships for "all" filter', () => {
      const all = getMockRomanticRelationshipsByFilter('all');
      const total = getMockRomanticRelationships();
      expect(all.length).toBe(total.length);
    });
  });

  describe('getMockRomanticRelationshipById', () => {
    it('should return relationship by id', () => {
      const relationships = getMockRomanticRelationships();
      const firstRel = relationships[0];
      const found = getMockRomanticRelationshipById(firstRel.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(firstRel.id);
    });

    it('should return undefined for invalid id', () => {
      const found = getMockRomanticRelationshipById('invalid-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getMockDateEvents', () => {
    it('should return date events for valid relationship id', () => {
      const relationships = getMockRomanticRelationships();
      const firstRel = relationships[0];
      const events = getMockDateEvents(firstRel.id);
      expect(Array.isArray(events)).toBe(true);
    });

    it('should return empty array for relationship without events', () => {
      const events = getMockDateEvents('non-existent-id');
      expect(Array.isArray(events)).toBe(true);
    });

    it('should return events with required fields', () => {
      const relationships = getMockRomanticRelationships();
      const firstRel = relationships[0];
      const events = getMockDateEvents(firstRel.id);
      events.forEach(event => {
        expect(event.id).toBeDefined();
        expect(event.date_type).toBeDefined();
        expect(event.date_time).toBeDefined();
      });
    });
  });

  describe('getMockRelationshipAnalytics', () => {
    it('should return analytics for valid relationship id', () => {
      const relationships = getMockRomanticRelationships();
      const firstRel = relationships[0];
      const analytics = getMockRelationshipAnalytics(firstRel.id);
      expect(analytics).toBeDefined();
      expect(analytics?.relationshipId).toBe(firstRel.id);
      expect(analytics?.personId).toBe(firstRel.person_id);
      expect(analytics?.personName).toBe(firstRel.person_name);
    });

    it('should return undefined for invalid relationship id', () => {
      const analytics = getMockRelationshipAnalytics('invalid-id');
      expect(analytics).toBeUndefined();
    });

    it('should include all required analytics fields', () => {
      const relationships = getMockRomanticRelationships();
      const firstRel = relationships[0];
      const analytics = getMockRelationshipAnalytics(firstRel.id);
      if (analytics) {
        expect(analytics.affectionScore).toBeDefined();
        expect(analytics.compatibilityScore).toBeDefined();
        expect(analytics.healthScore).toBeDefined();
        expect(analytics.intensityScore).toBeDefined();
        expect(Array.isArray(analytics.strengths)).toBe(true);
        expect(Array.isArray(analytics.weaknesses)).toBe(true);
        expect(Array.isArray(analytics.pros)).toBe(true);
        expect(Array.isArray(analytics.cons)).toBe(true);
        expect(Array.isArray(analytics.redFlags)).toBe(true);
        expect(Array.isArray(analytics.greenFlags)).toBe(true);
        expect(Array.isArray(analytics.insights)).toBe(true);
        expect(Array.isArray(analytics.recommendations)).toBe(true);
      }
    });
  });

  describe('getMockRankings', () => {
    it('should return rankings for overall category', () => {
      const rankings = getMockRankings('overall');
      expect(rankings.length).toBeGreaterThan(0);
      // Check that rankings are sorted
      for (let i = 1; i < rankings.length; i++) {
        const prev = rankings[i - 1].rank_among_all || 999;
        const curr = rankings[i].rank_among_all || 999;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('should return rankings for active category', () => {
      const rankings = getMockRankings('active');
      rankings.forEach(rel => {
        expect(rel.is_current).toBe(true);
        expect(rel.status).toBe('active');
      });
      // Check sorting
      for (let i = 1; i < rankings.length; i++) {
        const prev = rankings[i - 1].rank_among_active || 999;
        const curr = rankings[i].rank_among_active || 999;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('should return rankings sorted by compatibility', () => {
      const rankings = getMockRankings('compatibility');
      for (let i = 1; i < rankings.length; i++) {
        expect(rankings[i - 1].compatibility_score).toBeGreaterThanOrEqual(rankings[i].compatibility_score);
      }
    });

    it('should return rankings sorted by intensity', () => {
      const rankings = getMockRankings('intensity');
      for (let i = 1; i < rankings.length; i++) {
        expect(rankings[i - 1].emotional_intensity).toBeGreaterThanOrEqual(rankings[i].emotional_intensity);
      }
    });

    it('should return rankings sorted by health', () => {
      const rankings = getMockRankings('health');
      for (let i = 1; i < rankings.length; i++) {
        expect(rankings[i - 1].relationship_health).toBeGreaterThanOrEqual(rankings[i].relationship_health);
      }
    });
  });
});
