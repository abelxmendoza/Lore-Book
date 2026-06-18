import { describe, expect, it, vi } from 'vitest';

import { contradictionAgent } from '../../../src/services/agents/agents/contradictionAgent';
import type { LoreAgentInput, LoreAgentTools } from '../../../src/services/agents/loreAgentTypes';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'Actually I live in Berlin now.',
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

describe('ContradictionAgent', () => {
  it('skips when there are no contradictions', () => {
    expect(contradictionAgent.shouldRun(makeInput(makeMeaning()))).toBe(false);
  });

  it('proposes a correction routed to correction_authority (never overwrites)', async () => {
    const meaning = makeMeaning({
      contradictions: [
        { field: 'location', existingFact: 'lives in Munich', newClaim: 'lives in Berlin', severity: 'high', needsReview: true },
      ],
    });
    const result = await contradictionAgent.run(makeInput(meaning));

    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'propose_correction',
      requiresConfirmation: true,
      routeTo: 'correction_authority',
    });
    expect(result.proposedActions[0].payload).toMatchObject({
      field: 'location',
      existingFact: 'lives in Munich',
      newClaim: 'lives in Berlin',
    });
  });

  it('raises a warning for high-severity contradictions', async () => {
    const meaning = makeMeaning({
      contradictions: [
        { field: 'name', existingFact: 'Sam', newClaim: 'Samuel', severity: 'high', needsReview: true },
      ],
    });
    const result = await contradictionAgent.run(makeInput(meaning));
    expect(result.warnings.some((w) => w.code === 'high_severity_contradiction')).toBe(true);
  });

  it('scales confidence with severity', async () => {
    const low = await contradictionAgent.run(
      makeInput(makeMeaning({ contradictions: [{ field: 'f', existingFact: 'a', newClaim: 'b', severity: 'low', needsReview: true }] }))
    );
    const high = await contradictionAgent.run(
      makeInput(makeMeaning({ contradictions: [{ field: 'f', existingFact: 'a', newClaim: 'b', severity: 'high', needsReview: true }] }))
    );
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});
