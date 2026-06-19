import { describe, it, expect } from 'vitest';
import {
  getMockRelationshipInfluence,
  getMockRelationshipInfluenceForPerson,
  resolveMockRelationshipInfluence,
} from './romanticLifeImpact';

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
});
