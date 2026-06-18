import { describe, expect, it, vi } from 'vitest';

import { narrativeAgent } from '../../../src/services/agents/agents/narrativeAgent';
import type { LoreAgentInput, LoreAgentTools } from '../../../src/services/agents/loreAgentTypes';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'x',
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

function makeInput(message: string, meaning: MeaningResolutionResult, emotions: unknown[] = []): LoreAgentInput {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    messageId: 'msg-1',
    userMessage: message,
    pipelineResult: {
      lexical: { messageId: 'msg-1', userId: 'user-1', rawText: message, emotions } as unknown as LoreInterpretationResult['lexical'],
      meaning,
    },
    runId: 'run-1',
    tools: makeTools(),
  };
}

const eventMeaning = makeMeaning({
  resolvedEvents: [
    { kind: 'milestone', cue: 'graduated', confidence: 0.8, resolutionReason: '', requiresConfirmation: false } as unknown as MeaningResolutionResult['resolvedEvents'][number],
  ],
});

describe('NarrativeAgent', () => {
  it('skips trivial small talk', () => {
    expect(narrativeAgent.shouldRun(makeInput('lol ok', makeMeaning()))).toBe(false);
  });

  it('runs on narratively significant messages (events + emotion)', () => {
    const input = makeInput('I finally graduated and I felt overwhelmed with relief', eventMeaning, [{ label: 'relief' }]);
    expect(narrativeAgent.shouldRun(input)).toBe(true);
  });

  it('proposes a narrative summary refresh that requires confirmation', async () => {
    const input = makeInput('I finally graduated and I felt overwhelmed with relief', eventMeaning, [{ label: 'relief' }]);
    const result = await narrativeAgent.run(input);
    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'propose_narrative_update',
      requiresConfirmation: true,
      routeTo: 'none',
    });
    expect(result.observations.some((o) => o.kind === 'narrative_signal')).toBe(true);
  });
});
