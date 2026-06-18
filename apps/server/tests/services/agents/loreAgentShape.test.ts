import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { runLoreAgents } from '../../../src/services/agents/loreAgentOrchestrator';
import type { LoreInterpretationResult } from '../../../src/services/pipeline/loreInterpretationPipeline';
import type { MeaningResolutionResult } from '../../../src/services/meaning/meaningResolutionTypes';

function insertChain() {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'ilike', 'insert', 'update', 'limit']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  builder.single = vi.fn(async () => ({ data: null, error: null }));
  // insert resolves to a thenable-like result
  builder.insert = vi.fn(async () => ({ data: null, error: null }));
  return builder;
}

function makeMeaning(overrides: Partial<MeaningResolutionResult> = {}): MeaningResolutionResult {
  return {
    userId: 'user-1',
    messageId: 'msg-1',
    rawText: 'I started learning the cello.',
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
    memoryReviewCandidates: [
      { claim: 'User plays the cello', category: 'skill', confidence: 0.92, requiresConfirmation: true, source: 'lexical' },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePipelineResult(meaning: MeaningResolutionResult): LoreInterpretationResult {
  return {
    lexical: { messageId: meaning.messageId, userId: meaning.userId, rawText: meaning.rawText } as unknown as LoreInterpretationResult['lexical'],
    meaning,
  };
}

describe('runLoreAgents output shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => insertChain());
  });

  it('returns a runId and well-formed agent results', async () => {
    const out = await runLoreAgents({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'msg-1',
      userMessage: 'I started learning the cello.',
      pipelineResult: makePipelineResult(makeMeaning()),
    });

    expect(typeof out.runId).toBe('string');
    expect(out.runId.length).toBeGreaterThan(0);
    expect(Array.isArray(out.results)).toBe(true);
    expect(out.results.length).toBeGreaterThan(0);

    for (const result of out.results) {
      expect(result).toMatchObject({
        agentName: expect.any(String),
        runId: out.runId,
        observations: expect.any(Array),
        proposedActions: expect.any(Array),
        confidence: expect.any(Number),
        evidence: expect.any(Array),
        warnings: expect.any(Array),
        startedAt: expect.any(String),
        completedAt: expect.any(String),
      });
      // Every durable proposed action must require confirmation.
      for (const action of result.proposedActions) {
        expect(action.requiresConfirmation).toBe(true);
        expect(action.routeTo).not.toBe(undefined);
      }
    }
  });

  it('produces no results when nothing is worth remembering', async () => {
    const out = await runLoreAgents({
      userId: 'user-1',
      messageId: 'msg-2',
      userMessage: 'hi',
      pipelineResult: makePipelineResult(makeMeaning({ memoryReviewCandidates: [] })),
    });
    expect(out.results).toHaveLength(0);
  });
});
