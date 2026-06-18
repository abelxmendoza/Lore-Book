import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeAgentResults = vi.fn(async () => [{ actionType: 'propose_memory_mutation', routeTo: 'memory_review_queue', ok: true }]);
const persistResult = vi.fn(async () => undefined);

vi.mock('../../../src/config', () => ({
  config: { enableLoreAgents: true },
}));

vi.mock('../../../src/services/agents/loreAgentProposalRouter', () => ({
  routeAgentResults: (...args: unknown[]) => routeAgentResults(...args),
}));

vi.mock('../../../src/services/agents/loreAgentRunService', () => ({
  loreAgentRunService: { persistResult: (...args: unknown[]) => persistResult(...args) },
}));

vi.mock('../../../src/services/agents/loreAgentTools', () => ({
  loreAgentTools: {
    searchMemories: vi.fn(async () => []),
    getEntityGraph: vi.fn(async () => []),
    getRecentThreadContext: vi.fn(async () => []),
    getPipelineTrace: vi.fn(async () => null),
    getSystemKnowledge: vi.fn(async () => []),
    proposeMemoryMutation: vi.fn(async () => undefined),
  },
}));

import { runLoreAgents } from '../../../src/services/agents/loreAgentOrchestrator';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function makePipeline(candidates: MeaningResolutionResult['memoryReviewCandidates']): LoreInterpretationResult {
  const meaning: MeaningResolutionResult = {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'I play the cello.',
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
    memoryReviewCandidates: candidates,
    createdAt: new Date().toISOString(),
  };

  return {
    lexical: { messageId: 'msg-1', userId: 'user-1' } as LoreInterpretationResult['lexical'],
    meaning,
  };
}

describe('runLoreAgents integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists agent results and routes proposals when actions exist', async () => {
    const pipelineResult = makePipeline([
      { claim: 'User plays cello', category: 'skill', confidence: 0.92, provenance: [] },
    ]);

    const output = await runLoreAgents({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'msg-1',
      userMessage: 'I play the cello.',
      pipelineResult,
    });

    expect(output.runId).toBeTruthy();
    expect(output.results.some((r) => r.agentName === 'MemoryAgent')).toBe(true);
    expect(persistResult).toHaveBeenCalled();
    expect(routeAgentResults).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        messageId: 'msg-1',
        runId: output.runId,
      })
    );
  });

  it('does not call router when no proposals are emitted', async () => {
    await runLoreAgents({
      userId: 'user-1',
      messageId: 'msg-empty',
      userMessage: 'ok',
      pipelineResult: makePipeline([]),
    });

    expect(routeAgentResults).not.toHaveBeenCalled();
  });
});
