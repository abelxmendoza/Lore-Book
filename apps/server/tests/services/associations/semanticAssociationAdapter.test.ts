/**
 * Semantic → Association adapter tests.
 *
 * Verifies the Association Graph consumes the analyzer's resolved
 * SemanticAnalysis: canonical endpoints flow through, relationType maps to the
 * right AssociationType, membership stays explicit-only, and the regex fallback
 * gets its entities upgraded to canonical identity.
 */
import { describe, it, expect } from 'vitest';

import {
  associationInferenceService,
  semanticAssociationAdapter,
  mapRelationType,
  AssociationGraph,
} from '../../../src/services/associations';
import type { SemanticAnalysis } from '../../../src/services/lorebook/semantic/semanticAnalysisTypes';

function analysis(partial: Partial<SemanticAnalysis>): SemanticAnalysis {
  return {
    userId: 'u1',
    text: '',
    entities: [],
    relationships: [],
    events: [],
    crossBook: [],
    ambiguities: [],
    reviewItems: [],
    suppressed: [],
    stances: [],
    temporal: [],
    contradictions: [],
    provenance: [],
    confidence: 0.8,
    warnings: [],
    ...partial,
  };
}

describe('mapRelationType', () => {
  it('maps kinship to related_to and unknown relations to the default tie', () => {
    expect(mapRelationType('cousin').type).toBe('related_to');
    expect(mapRelationType('best_friend').type).toBe('associated_with');
    expect(mapRelationType('something_unheard_of').type).toBe('associated_with');
  });

  it('only employment/ownership relations are explicit membership', () => {
    expect(mapRelationType('employer')).toEqual({ type: 'member_of', explicit: true });
    expect(mapRelationType('works at')).toEqual({ type: 'member_of', explicit: true });
    expect(mapRelationType('friend').explicit).toBeUndefined();
  });
});

describe('semanticAssociationAdapter.fromAnalysis', () => {
  it('preserves canonical entityIds from resolved edges', () => {
    const obs = semanticAssociationAdapter.fromAnalysis(
      analysis({
        text: 'Abel works at Vanguard Robotics',
        relationships: [
          {
            from: { entityId: 'char-abel', domain: 'characters', name: 'Abel' },
            to: { entityId: 'org-vanguard', domain: 'organizations', name: 'Vanguard Robotics' },
            relationType: 'works_at',
            confidence: 0.95,
            gate: 'suggest',
            bothEndpointsResolved: true,
          },
        ],
      }),
    );

    expect(obs).toHaveLength(1);
    expect(obs[0].source.id).toBe('char-abel');
    expect(obs[0].target.id).toBe('org-vanguard');
    expect(obs[0].associationType).toBe('member_of');
    expect(obs[0].explicit).toBe(true);
  });

  it('does NOT treat a dangling employment edge as confirmed membership', () => {
    const obs = semanticAssociationAdapter.fromAnalysis(
      analysis({
        relationships: [
          {
            from: { domain: 'characters', name: 'Abel' },
            to: { domain: 'organizations', name: 'Some Place' },
            relationType: 'works_at',
            confidence: 0.5,
            gate: 'review',
            bothEndpointsResolved: false,
          },
        ],
      }),
    );
    // Still member_of by type, but not flagged explicit (endpoints unresolved).
    expect(obs[0].associationType).toBe('member_of');
    expect(obs[0].explicit).toBe(false);
  });
});

describe('associationInferenceService.inferFromAnalysis', () => {
  it('upgrades regex-fallback entities to canonical identity', () => {
    // No semantic edge for the visit, but the venue is resolved in `entities`.
    const result = associationInferenceService.inferFromAnalysis(
      analysis({
        text: 'I went to Club Nova',
        entities: [
          {
            name: 'Club Nova',
            domain: 'locations',
            resolution: 'known',
            matchedId: 'loc-club-nova',
            matchedName: 'Club Nova',
            confidence: 0.9,
            criteria: ['exact'],
            sourceSpanIds: [],
            gate: 'suggest',
          },
        ],
      }),
    );

    const visited = result.observations.find((o) => o.associationType === 'visited');
    expect(visited).toBeTruthy();
    // Provisional id replaced with the canonical one from the analyzer.
    expect(visited?.target.id).toBe('loc-club-nova');
  });

  it('semantic edges win over the regex fallback for the same pair', () => {
    const graph = new AssociationGraph();
    const result = associationInferenceService.ingestFromAnalysis(
      analysis({
        text: 'I worked with Gary',
        entities: [
          { name: 'Gary', domain: 'characters', resolution: 'known', matchedId: 'char-gary', matchedName: 'Gary', confidence: 0.9, criteria: [], sourceSpanIds: [], gate: 'suggest' },
        ],
        relationships: [
          {
            from: { entityId: 'self', domain: 'characters', name: 'Abel' },
            to: { entityId: 'char-gary', domain: 'characters', name: 'Gary' },
            relationType: 'colleague',
            confidence: 0.8,
            gate: 'suggest',
            bothEndpointsResolved: true,
          },
        ],
      }),
      { id: 'self', name: 'Self', kind: 'person' },
      graph,
    );

    const workedWith = result.observations.filter((o) => o.associationType === 'worked_with');
    // Exactly one worked_with Gary edge (semantic + resolved fallback collapsed).
    expect(workedWith).toHaveLength(1);
    expect(workedWith[0].target.id).toBe('char-gary');
  });
});
