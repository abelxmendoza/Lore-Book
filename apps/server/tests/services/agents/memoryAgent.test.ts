import { describe, expect, it, vi } from 'vitest';

import { memoryAgent } from '../../../src/services/agents/agents/memoryAgent';
import type {
  LoreAgentInput,
  LoreAgentTools,
} from '../../../src/services/agents/loreAgentTypes';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult, MemoryReviewCandidate } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'I started learning the cello in 2019.',
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

function makePipelineResult(meaning: MeaningResolutionResult): LoreInterpretationResult {
  return {
    lexical: {
      messageId: meaning.messageId,
      userId: meaning.userId,
      rawText: meaning.rawText,
      normalizedText: meaning.rawText.toLowerCase(),
      entities: [],
      intents: [],
      emotions: [],
      relationships: [],
      skills: [],
      places: [],
      events: [],
      ontologyCandidates: [],
      memoryCandidates: [],
      glossaryMatches: [],
      ambiguityFlags: [],
      needsClarification: false,
      entityLinks: [],
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    } as unknown as LoreInterpretationResult['lexical'],
    meaning,
  };
}

function makeTools(proposeSpy = vi.fn()): LoreAgentTools {
  return {
    searchMemories: vi.fn(async () => []),
    getEntityGraph: vi.fn(async () => []),
    getRecentThreadContext: vi.fn(async () => []),
    getPipelineTrace: vi.fn(async () => null),
    getSystemKnowledge: vi.fn(async () => []),
    proposeMemoryMutation: proposeSpy,
  };
}

function makeInput(meaning: MeaningResolutionResult, tools: LoreAgentTools): LoreAgentInput {
  return {
    userId: 'user-1',
    threadId: 'thread-1',
    messageId: 'msg-1',
    userMessage: meaning.rawText,
    pipelineResult: makePipelineResult(meaning),
    runId: 'run-1',
    tools,
  };
}

const durableCandidate: MemoryReviewCandidate = {
  claim: 'User plays the cello',
  category: 'skill',
  confidence: 0.92,
  requiresConfirmation: true,
  source: 'lexical skill detector',
};

describe('MemoryAgent', () => {
  it('skips when there are no memory candidates', () => {
    const meaning = makeMeaning({ memoryReviewCandidates: [] });
    const input = makeInput(meaning, makeTools());
    expect(memoryAgent.shouldRun(input)).toBe(false);
  });

  it('proposes a durable memory mutation for high-confidence candidates', async () => {
    const meaning = makeMeaning({ memoryReviewCandidates: [durableCandidate] });
    const proposeSpy = vi.fn(async () => {});
    const tools = makeTools(proposeSpy);
    const input = makeInput(meaning, tools);

    expect(memoryAgent.shouldRun(input)).toBe(true);

    const result = await memoryAgent.run(input);

    expect(result.agentName).toBe('MemoryAgent');
    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions[0]).toMatchObject({
      type: 'propose_memory_mutation',
      requiresConfirmation: true,
      routeTo: 'memory_review_queue',
    });
    // Agents are pure: persistence is the orchestrator's job, not the agent's.
    expect(proposeSpy).not.toHaveBeenCalled();
  });

  it('does not propose mutations for low-confidence (context) candidates', async () => {
    const meaning = makeMeaning({
      memoryReviewCandidates: [{ ...durableCandidate, confidence: 0.3 }],
    });
    const proposeSpy = vi.fn(async () => {});
    const result = await memoryAgent.run(makeInput(meaning, makeTools(proposeSpy)));

    expect(result.proposedActions).toHaveLength(0);
    expect(result.observations.some((o) => o.kind === 'context_memory_candidate')).toBe(true);
    expect(proposeSpy).not.toHaveBeenCalled();
  });

  it('does not propose mutations for hypothetical statements', async () => {
    const meaning = makeMeaning({
      factuality: 'hypothetical',
      memoryReviewCandidates: [durableCandidate],
    });
    const result = await memoryAgent.run(makeInput(meaning, makeTools()));
    expect(result.proposedActions).toHaveLength(0);
  });
});
