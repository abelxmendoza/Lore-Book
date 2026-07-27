import { describe, expect, it } from 'vitest';
import type { FamilyQueryRequest } from '@lorebook/api-contracts';

import type { FamilyGraph } from './familyGraphService';
import type { HouseholdDTO } from './householdService';
import { compileFamilyQuery, deriveFamilyQueryHints } from './familyQueryService';

const graph: FamilyGraph = {
  selfId: 'self',
  nodes: [
    { characterId: 'self', name: 'You', generation: 0, isSelf: true, confidence: 1, evidenceCount: 0 },
    { characterId: 'marcus', name: 'Marcus Vale', generation: 0, confidence: 0.9, evidenceCount: 4 },
    { characterId: 'jamie', name: 'Jamie Vale', generation: -1, confidence: 0.7, evidenceCount: 1 },
  ],
  edges: [],
  tree: {
    self_id: 'self',
    branches: [{ side: 'maternal', label: 'Vale branch', color: '#fff' }],
    members: [
      { id: 'self', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
      {
        id: 'marcus', name: 'Marcus Vale', relation: 'cousin', relation_label: 'Cousin',
        generation: 0, side: 'maternal', inference_status: 'asserted', has_card: true,
      },
      {
        id: 'jamie', name: 'Jamie Vale', relation: 'aunt', relation_label: 'Aunt',
        generation: -1, side: 'maternal', inference_status: 'inferred', has_card: false, needs_review: true,
      },
    ],
  },
};

const households: HouseholdDTO[] = [{
  id: 'vale-house',
  name: 'Vale House',
  headOfHousehold: 'Jamie Vale',
  members: [
    { characterId: 'marcus', name: 'Marcus Vale', householdRole: 'resident', confidence: 0.9 },
    { characterId: 'jamie', name: 'Jamie Vale', householdRole: 'head_of_household', confidence: 0.9 },
  ],
  residents: [],
  visitors: [],
  residentCount: 2,
  confidence: 0.9,
}];

const analytics = [
  { characterId: 'marcus', name: 'Marcus Vale', strength: 0.9, mentionCount: 7, evidenceCount: 4, trend: 'growing' as const },
  { characterId: 'jamie', name: 'Jamie Vale', strength: 0.6, mentionCount: 1, evidenceCount: 1, trend: 'inactive' as const },
];

const request = (query: string): FamilyQueryRequest => ({
  query, filters: {}, sort: 'relevance', limit: 30, offset: 0, includeFacets: true,
});

describe('familyQueryService', () => {
  it('parses kinship, branch, household, and quality requests', () => {
    expect(deriveFamilyQueryHints('Show my maternal cousins')).toMatchObject({
      intent: 'branch', relations: ['cousin'], sides: ['maternal'],
    });
    expect(deriveFamilyQueryHints('Which relatives need review?')).toMatchObject({
      intent: 'quality', needsReview: true,
    });
    expect(deriveFamilyQueryHints('Who lives in the Vale House?').intent).toBe('household');
  });

  it('filters the canonical tree by relation and branch', () => {
    const result = compileFamilyQuery(graph, households, analytics, request('Show my maternal cousins'));
    expect(result.results.map((item) => item.name)).toEqual(['Marcus Vale']);
    expect(result.results[0].matchedReasons).toContain('Relationship: Cousin');
    expect(result.facets.relations).toEqual([{ value: 'cousin', count: 1 }]);
  });

  it('finds review and missing-card records', () => {
    const result = compileFamilyQuery(graph, households, analytics, request('Which relatives need review?'));
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ name: 'Jamie Vale', needsReview: true, hasCard: false });
  });

  it('returns household context with matched residents', () => {
    const result = compileFamilyQuery(graph, households, analytics, request('Who lives in the Vale House?'));
    expect(result.households).toHaveLength(1);
    expect(result.households[0]).toMatchObject({ name: 'Vale House', residentCount: 2 });
  });
});

