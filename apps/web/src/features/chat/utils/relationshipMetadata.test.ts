import { describe, expect, it } from 'vitest';
import {
  extractRelationshipGroups,
  extractRelationshipPersistStats,
} from './relationshipMetadata';

describe('extractRelationshipGroups', () => {
  it('returns grouped entities from ontology enrichment metadata', () => {
    const groups = extractRelationshipGroups({
      ontology_enrichment: {
        relationship_groups: [
          {
            scope: 'FAMILY',
            entityNames: ['Marcus', 'Grandma Rose'],
            confidence: 0.9,
            hint: 'FAMILY_RELATIONSHIP',
          },
          {
            scope: 'PROFESSIONAL',
            entityNames: ['Armstrong Robotics'],
            confidence: 0.85,
          },
        ],
      },
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].scope).toBe('FAMILY');
    expect(groups[0].entityNames).toEqual(['Marcus', 'Grandma Rose']);
    expect(groups[1].entityNames).toEqual(['Armstrong Robotics']);
  });

  it('filters empty groups and missing metadata', () => {
    expect(extractRelationshipGroups(undefined)).toEqual([]);
    expect(extractRelationshipGroups({})).toEqual([]);
    expect(
      extractRelationshipGroups({
        ontology_enrichment: { relationship_groups: [{ scope: 'SOCIAL', entityNames: [] }] },
      })
    ).toEqual([]);
  });
});

describe('extractRelationshipPersistStats', () => {
  it('reads pipeline persistence counters', () => {
    expect(
      extractRelationshipPersistStats({
        relationship_persistence: {
          persisted: 2,
          skipped: 1,
          characterEdges: 1,
          entityEdges: 1,
        },
      })
    ).toEqual({
      persisted: 2,
      skipped: 1,
      characterEdges: 1,
      entityEdges: 1,
    });
  });

  it('returns null when stats are absent', () => {
    expect(extractRelationshipPersistStats(null)).toBeNull();
    expect(extractRelationshipPersistStats({ relationship_persistence: { skipped: 1 } })).toBeNull();
  });
});
