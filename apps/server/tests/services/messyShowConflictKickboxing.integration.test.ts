import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertMessyActionChips,
  assertMessyLexicalSnapshot,
  assertMessyMeaningSnapshot,
  assertMessyPipelineMetadata,
  MESSY_SHOW_CONFLICT_KICKBOXING_ID,
  MESSY_SHOW_CONFLICT_KICKBOXING_TEXT,
} from '../fixtures/messyShowConflictKickboxing';

const capturedMetadata: { value?: Record<string, unknown> } = {};

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'insert', 'update']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn(async () => ({ data: { id: 'lex-messy' }, error: null }));
      chain.maybeSingle = vi.fn(async () => ({
        data: { metadata: capturedMetadata.value ?? {} },
        error: null,
      }));
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      if (table === 'meaning_resolution_results' || table === 'lexical_analysis_results') {
        return chain;
      }
      if (table === 'chat_messages') {
        chain.update = vi.fn((payload: { metadata: Record<string, unknown> }) => {
          capturedMetadata.value = payload.metadata;
          return chain;
        });
        return chain;
      }
      return chain;
    }),
    auth: { admin: { getUserById: vi.fn() } },
  },
}));

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn().mockResolvedValue({ id: 'self-1', name: 'Me' }),
  },
}));

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({ proposal: { id: 'p1' }, auto_approved: false }),
  },
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([{ id: 'self-1', primary_name: 'Me' }]),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-1', type: 'SELF' }]),
  },
}));

vi.mock('../../src/services/ontology/relationshipPersistenceService', () => ({
  relationshipPersistenceService: {
    persistFromInterpretation: vi.fn().mockResolvedValue({ persisted: 0, skipped: 0, characterEdges: 0, entityEdges: 0 }),
  },
}));

vi.mock('../../src/services/ontology/ontologyEnrichmentService', () => ({
  enrichFromLexicalAnalysisAsync: vi.fn().mockResolvedValue({ source: 'lexical_analyzer' }),
  enrichFromMeaningResolutionAsync: vi.fn().mockResolvedValue({ source: 'meaning_resolution' }),
}));

import { runLoreInterpretationPipeline } from '../../src/services/pipeline/loreInterpretationPipeline';
import { buildActionsFromMeaning } from '../../src/services/ontology/actionPlanService';

describe(`integration: ${MESSY_SHOW_CONFLICT_KICKBOXING_ID}`, () => {
  beforeEach(() => {
    capturedMetadata.value = undefined;
    vi.clearAllMocks();
  });

  it('runs Lexer → Parser → Mapper → Planner with expected metadata', async () => {
    const { lexical, meaning } = await runLoreInterpretationPipeline({
      userId: 'user-messy',
      messageId: 'msg-messy-pipeline',
      text: MESSY_SHOW_CONFLICT_KICKBOXING_TEXT,
      threadId: 'thread-messy',
    });

    assertMessyLexicalSnapshot(lexical);
    assertMessyMeaningSnapshot(meaning);

    const pipeline = capturedMetadata.value?.interpretation_pipeline as Record<string, unknown> | undefined;
    expect(pipeline?.phases).toEqual(['lexer', 'parser', 'inference', 'mapper', 'planner']);

    assertMessyPipelineMetadata(capturedMetadata.value ?? {});
    expect(capturedMetadata.value?.inference_associations).toBeDefined();

    const actions = buildActionsFromMeaning(meaning);
    assertMessyActionChips(actions);
  });
});
