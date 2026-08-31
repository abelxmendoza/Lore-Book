import { describe, expect, it } from 'vitest';

import type { CognitivePlan } from '../cognitivePlanner/cognitivePlanner';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';
import {
  resolveCompositionPlan,
  resolveCompositionProfile,
} from './index';

function cognitive(
  overrides: Partial<CognitivePlan> = {},
): CognitivePlan {
  return {
    strategy: 'general',
    retrieve: ['knowledge'],
    reasoning: 'retrieve',
    expectedAnswer: 'chat',
    allowObservationSearch: true,
    directive: '',
    ...overrides,
  };
}

function scope(
  overrides: Partial<ResponseScopePlan> = {},
): ResponseScopePlan {
  return {
    intent: 'general',
    contextPlan: {} as ResponseScopePlan['contextPlan'],
    responseMode: 'chat',
    scopeSource: 'message',
    allowedDomains: [],
    blockedDomains: [],
    primaryEntities: [],
    isCorrection: false,
    correctionNames: [],
    maxEvidenceItems: 12,
    maxCharactersReturned: 4000,
    includeProvenanceSummary: false,
    includeUncertainty: true,
    closedScope: false,
    ...overrides,
  };
}

describe('resolveCompositionProfile', () => {
  it.each([
    ['recall', { scopePlan: scope({ responseMode: 'focused_recall' }) }],
    ['character', { cognitivePlan: cognitive({ strategy: 'identity' }) }],
    ['timeline', { scopePlan: scope({ intent: 'timeline' }) }],
    ['reflection', { cognitivePlan: cognitive({ strategy: 'reflect_patterns' }) }],
    ['planning', { cognitivePlan: cognitive({ strategy: 'planning' }) }],
    ['debug', { scopePlan: scope({ responseMode: 'debug_inspector' }) }],
    ['general', {}],
  ] as const)('resolves the %s profile from deterministic signals', (expected, input) => {
    expect(resolveCompositionProfile(input)).toBe(expected);
  });

  it('falls back to general when no profile signal is present', () => {
    const plan = resolveCompositionPlan();

    expect(plan.profile).toBe('general');
    expect(plan.selectedEvidenceIds).toEqual([]);
    expect(plan.discardedEvidenceIds).toEqual([]);
  });
});

describe('resolveCompositionPlan', () => {
  it('keeps corrections conversational and carries AnswerPlan avoidance into rationale', () => {
    const plan = resolveCompositionPlan({
      answerPlan: {
        primaryFocus: 'The corrected roster',
        secondaryReferences: [],
        avoid: ['unrelated romance details'],
        rationale: 'synthetic correction fixture',
      },
      cognitivePlan: cognitive({ strategy: 'general' }),
      scopePlan: scope({
        responseMode: 'focused_recall',
        isCorrection: true,
        correctionNames: ['Jamie'],
      }),
    });

    expect(plan.profile).toBe('recall');
    expect(plan.rationale).toContain('correction=true');
    expect(plan.rationale).toContain('avoid=unrelated romance details');
    expect(plan.narrativeStrategy).toBe('answer_then_support');
  });

  it('returns an empty evidence decision without inventing source IDs', () => {
    const plan = resolveCompositionPlan({
      cognitivePlan: cognitive({ strategy: 'timeline' }),
      scopePlan: scope({ intent: 'timeline' }),
    });

    expect(plan.selectedEvidenceIds).toEqual([]);
    expect(plan.discardedEvidenceIds).toEqual([]);
    expect(plan.rationale).toContain('selected=0');
    expect(plan.rationale).toContain('discarded=0');
  });

  it('separates selected and discarded IDs deterministically', () => {
    const plan = resolveCompositionPlan({
      sources: [
        { id: 'source-c', relevanceScore: 10, usage: 'rejected' },
        { id: 'source-a', relevanceScore: 90, usage: 'supporting' },
        { id: 'source-b', relevanceScore: 60, usage: 'background' },
      ],
      audited: [
        { id: 'audit-d', kept: false, reason: 'out of scope', score: 70 },
      ],
      scopePlan: scope({ responseMode: 'focused_recall' }),
    });

    expect(plan.selectedEvidenceIds).toEqual(['source-a', 'source-b']);
    expect(plan.discardedEvidenceIds).toEqual(['audit-d', 'source-c']);
  });
});
