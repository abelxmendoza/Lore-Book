import { describe, expect, it, vi } from 'vitest';

import { identityAgent } from '../../../src/services/agents/agents/identityAgent';
import type { LoreAgentInput, LoreAgentTools } from '../../../src/services/agents/loreAgentTypes';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'My brother Alex called.',
    resolvedEntities: [],
    resolvedRelationships: [],
    resolvedSkills: [],
    resolvedPlaces: [],
    resolvedEvents: [],
    references: [],
    identityCollisions: [],
    contradictions: [],
    ambiguities: [],
    temporalContext: { defaultStatus: 'present', statements: [] },
    factuality: 'fact',
    confidence: 0.9,
    ontologyActionCandidates: [],
    memoryReviewCandidates: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTools(): LoreAgentTools {
  return {
    searchMemories: vi.fn(async () => []),
    getEntityGraph: vi.fn(async () => []),
    getRecentThreadContext: vi.fn(async () => []),
    getPipelineTrace: vi.fn(async () => null),
    getSystemKnowledge: vi.fn(async () => []),
    proposeMemoryMutation: vi.fn(async () => {}),
  };
}

function makeInput(meaning: MeaningResolutionResult): LoreAgentInput {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    messageId: 'msg-1',
    userMessage: meaning.rawText,
    pipelineResult: {
      lexical: { messageId: 'msg-1', userId: 'user-1', rawText: meaning.rawText } as unknown as LoreInterpretationResult['lexical'],
      meaning,
    },
    runId: 'run-1',
    tools: makeTools(),
  };
}

describe('IdentityAgent', () => {
  it('skips when there are no collisions, references, or identity candidates', () => {
    expect(identityAgent.shouldRun(makeInput(makeMeaning()))).toBe(false);
  });

  it('proposes a review (never a merge) for an identity collision', async () => {
    const meaning = makeMeaning({
      identityCollisions: [
        { name: 'Alex', claims: ['self', 'relationship'], confidence: 0.8, mustNotAutoMerge: true, requiresConfirmation: true },
      ],
    });
    const result = await identityAgent.run(makeInput(meaning));

    const actions = result.proposedActions.filter((a) => a.type === 'propose_identity_review');
    expect(actions).toHaveLength(1);
    expect(actions[0].routeTo).toBe('entity_authority');
    expect(actions[0].payload.mustNotAutoMerge).toBe(true);
    // No auto-merge action should ever be produced from a collision.
    expect(result.proposedActions.some((a) => a.type === 'propose_entity_merge')).toBe(false);
    expect(result.warnings.some((w) => w.code === 'identity_collision')).toBe(true);
  });

  it('emits informational observations for resolved references', async () => {
    const meaning = makeMeaning({
      references: [
        { reference: 'he', antecedent: 'Alex', antecedentKind: 'PERSON', confidence: 0.85, resolutionReason: 'nearest male antecedent' },
      ],
    });
    const result = await identityAgent.run(makeInput(meaning));
    expect(result.observations.some((o) => o.kind === 'reference_resolved')).toBe(true);
    expect(result.proposedActions).toHaveLength(0);
  });

  it('maps ontology identity candidates to alias / merge proposals', async () => {
    const meaning = makeMeaning({
      ontologyActionCandidates: [
        { kind: 'set_legal_name', label: 'Set legal name to Alexander', confidence: 0.7, requiresConfirmation: true, payload: { name: 'Alexander' } },
        { kind: 'resolve_duplicate', label: 'Merge duplicate Alex', confidence: 0.75, requiresConfirmation: true, payload: { ids: ['a', 'b'] } },
      ],
    });
    const result = await identityAgent.run(makeInput(meaning));
    expect(result.proposedActions.some((a) => a.type === 'propose_alias')).toBe(true);
    expect(result.proposedActions.some((a) => a.type === 'propose_entity_merge')).toBe(true);
    expect(result.proposedActions.every((a) => a.routeTo === 'entity_authority')).toBe(true);
  });
});
