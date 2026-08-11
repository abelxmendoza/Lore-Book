import { describe, it, expect } from 'vitest';
import {
  getMockRelationshipInfluence,
  getMockRelationshipInfluenceForPerson,
  resolveMockRelationshipInfluence,
} from './romanticLifeImpact';
import { generateMockRomanticRelationships } from './romanticRelationships';

describe('romanticLifeImpact', () => {
  it('returns unique impact stories per relationship id', () => {
    const alex = getMockRelationshipInfluence('rel-001');
    const nova = getMockRelationshipInfluence('rel-008');
    expect(alex?.impact_label).toBe('Transformative');
    expect(nova?.impact_label).toBe('Scarring');
    expect(alex?.impact_summary).not.toEqual(nova?.impact_summary);
  });

  it('resolves influence by person id in demo', () => {
    const byPerson = getMockRelationshipInfluenceForPerson('char-001', 'Alex');
    expect(byPerson?.life_arcs_influenced.some((a) => a.title.includes('Creative'))).toBe(true);
  });

  it('resolveMockRelationshipInfluence prefers relationship id', () => {
    const resolved = resolveMockRelationshipInfluence({
      relationshipId: 'rel-003',
      personId: 'char-001',
    });
    expect(resolved?.impact_label).toBe('Significant');
  });

  // Regression: every relationship with kids_together data (the ones the
  // Dating & Romance "Kids Together" tab links to) must ALSO have a Life
  // Impact story, or that tab renders empty in demo mode for exactly the
  // relationships someone would open first while checking Kids Together.
  it('covers Life Impact for every demo relationship that has kids together', () => {
    const withKids = generateMockRomanticRelationships().filter(
      (rel) => rel.metadata?.has_kids_together === true,
    );
    expect(withKids.length).toBeGreaterThan(0);
    for (const rel of withKids) {
      const influence = getMockRelationshipInfluence(rel.id);
      expect(influence, `${rel.id} (${rel.person_name}) has kids together but no Life Impact story`).toBeDefined();
      expect(influence?.impact_summary?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
