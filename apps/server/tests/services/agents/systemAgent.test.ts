import { describe, expect, it, vi } from 'vitest';

import { systemAgent } from '../../../src/services/agents/agents/systemAgent';
import type { LoreAgentInput, LoreAgentTools } from '../../../src/services/agents/loreAgentTypes';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult, ResolvedEntity } from '../../../src/services/meaning/meaningResolutionTypes';

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'My friend Dana moved to Oslo.',
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

const entity: ResolvedEntity = {
  surface: 'Dana',
  normalized: 'dana',
  kind: 'PERSON',
  confidence: 0.9,
  resolutionReason: 'detected',
  requiresConfirmation: false,
};

function makeTools(knowledge: Array<Record<string, unknown>> = []): LoreAgentTools {
  return {
    searchMemories: vi.fn(async () => []),
    getEntityGraph: vi.fn(async () => []),
    getRecentThreadContext: vi.fn(async () => []),
    getPipelineTrace: vi.fn(async () => ({ messageId: 'msg-1', phases: ['lexer', 'parser', 'mapper'] })),
    getSystemKnowledge: vi.fn(async () => knowledge),
    proposeMemoryMutation: vi.fn(async () => {}),
  };
}

function makeInput(meaning: MeaningResolutionResult, tools: LoreAgentTools): LoreAgentInput {
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
    tools,
  };
}

describe('SystemAgent', () => {
  it('skips when nothing happened', () => {
    expect(systemAgent.shouldRun(makeInput(makeMeaning(), makeTools()))).toBe(false);
  });

  it('explains the pipeline and produces no proposed actions', async () => {
    const meaning = makeMeaning({ resolvedEntities: [entity] });
    const result = await systemAgent.run(makeInput(meaning, makeTools()));

    expect(result.proposedActions).toHaveLength(0);
    expect(result.observations.some((o) => o.kind === 'system_explanation')).toBe(true);
    // Every claim must cite a source file (no hallucination).
    expect(result.observations.every((o) => o.evidence.every((e) => Boolean(e.sourceFile)))).toBe(true);
  });

  it('prefers system_knowledge rows from the DB over the static fallback', async () => {
    const meaning = makeMeaning({ resolvedEntities: [entity] });
    const tools = makeTools([
      {
        concept: 'memory_ingestion_pipeline',
        description: 'Custom DB description',
        source_file: 'apps/server/src/services/pipeline/loreInterpretationPipeline.ts',
        service_name: 'loreInterpretationPipeline',
      },
    ]);
    const result = await systemAgent.run(makeInput(meaning, tools));
    expect(result.observations.some((o) => o.evidence.some((e) => e.detail === 'Custom DB description'))).toBe(true);
  });
});
