import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * End-to-end style test for the ingestion pipeline: drives the PUBLIC
 * `ingestMessage` entry point all the way through `ingestMessageCore`, with only
 * the I/O boundaries (Supabase) and the heavy LLM/extraction collaborators
 * stubbed. This verifies the orchestration wiring itself — message → utterances
 * → units → returned ids — across several message shapes.
 */

// ── Supabase mock (table + op aware) ─────────────────────────────────────────
type Resp = { data: unknown; error: unknown };

const h = vi.hoisted(() => {
  const routes: Record<string, (ctx: { op: string; terminal: string }) => Resp> = {};
  function makeBuilder(table: string) {
    let op = 'select';
    const result = (terminal: string): Resp => {
      const fn = routes[table];
      return fn ? fn({ op, terminal }) : { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => {
        op = 'insert';
        return builder;
      }),
      update: vi.fn(() => {
        op = 'update';
        return builder;
      }),
      upsert: vi.fn(() => {
        op = 'upsert';
        return builder;
      }),
      delete: vi.fn(() => {
        op = 'delete';
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      or: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(result('single'))),
      maybeSingle: vi.fn(() => Promise.resolve(result('maybeSingle'))),
      then: (onF: (v: Resp) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(result('then')).then(onF, onR),
    };
    return builder;
  }
  const supabaseAdmin = { from: vi.fn((table: string) => makeBuilder(table)) };
  return {
    supabaseAdmin,
    setRoute: (table: string, fn: (ctx: { op: string; terminal: string }) => Resp) => {
      routes[table] = fn;
    },
    reset: () => {
      for (const k of Object.keys(routes)) delete routes[k];
    },
  };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: h.supabaseAdmin }));

// ── Boundary / collaborator mocks ────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  splitIntoUtterances: vi.fn((text: string) => [text]),
  normalizeText: vi.fn(async (text: string) => ({
    normalized_text: text,
    language: 'en',
    refinement_level: 'light',
    original_preserved: true,
    corrections: [],
    spanish_terms: [],
  })),
  splitEntryIntoEvents: vi.fn(async () => ({ events: [{ content: 'x' }], spanish_terms: [] })),
  convertToExtractedUnits: vi.fn(() => []),
  extractSemanticUnits: vi.fn(async (text: string) => ({
    units: [
      {
        type: 'EXPERIENCE',
        content: text,
        confidence: 0.8,
        // start_time present → skips the temporal-resolver dynamic import path
        temporal_context: { start_time: new Date().toISOString() },
        entity_ids: [],
        emotions: [],
        themes: [],
        metadata: {},
      },
    ],
    route: 'rule-based',
    classification: { complexity: 'simple', category: 'general', confidence: 0.9 },
  })),
  enrichEntry: vi.fn(async () => ({
    emotions: [],
    themes: [],
    people: [],
    intensity: 'LOW',
    is_venting: false,
  })),
  compileUtteranceToIR: vi.fn(async () => ({ id: 'ir-1' })),
  updateDependencyGraph: vi.fn(async () => undefined),
  consolidateEntry: vi.fn(async () => undefined),
  createKnowledgeUnit: vi.fn(async () => ({ id: 'ku-1', knowledge_type: 'EXPERIENCE' })),
  convertUnitsToMemoryArtifacts: vi.fn(async () => ({
    perceptionEntries: [],
    journalEntries: [],
    insights: [],
  })),
  detectCorrection: vi.fn(async () => ({
    isCorrection: false,
    correctedUnitIds: [],
    correctionType: undefined,
  })),
  autoResolveContradictions: vi.fn(async () => []),
  assembleEvents: vi.fn(async () => []),
  resolveEntities: vi.fn(async () => []),
  resolveManyById: vi.fn(async () => []),
  ingestConversationER: vi.fn(() => undefined),
  updateOnMessage: vi.fn(async () => undefined),
  processRecentDays: vi.fn(async () => undefined),
  processChatMessage: vi.fn(async () => undefined),
  runShadow: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/conversationCentered/normalizationService', () => ({
  normalizationService: {
    splitIntoUtterances: mocks.splitIntoUtterances,
    normalizeText: mocks.normalizeText,
  },
}));
vi.mock('../../src/services/conversationCentered/multiEventSplittingService', () => ({
  multiEventSplittingService: {
    splitEntryIntoEvents: mocks.splitEntryIntoEvents,
    convertToExtractedUnits: mocks.convertToExtractedUnits,
  },
}));
vi.mock('../../src/services/conversationCentered/hybridExtractor', () => ({
  hybridExtractor: { extractSemanticUnits: mocks.extractSemanticUnits },
}));
vi.mock('../../src/services/entryEnrichmentService', () => ({
  entryEnrichmentService: { enrichEntry: mocks.enrichEntry },
}));
vi.mock('../../src/services/compiler/irCompiler', () => ({
  irCompiler: { compileUtteranceToIR: mocks.compileUtteranceToIR },
}));
vi.mock('../../src/services/compiler/dependencyGraph', () => ({
  dependencyGraph: { updateDependencyGraph: mocks.updateDependencyGraph },
}));
vi.mock('../../src/services/compiler/memoryConsolidationService', () => ({
  memoryConsolidationService: { consolidateEntry: mocks.consolidateEntry },
}));
vi.mock('../../src/services/knowledgeTypeEngineService', () => ({
  knowledgeTypeEngineService: { createKnowledgeUnit: mocks.createKnowledgeUnit },
}));
vi.mock('../../src/services/conversationCentered/semanticConversion', () => ({
  semanticConversionService: {
    convertUnitsToMemoryArtifacts: mocks.convertUnitsToMemoryArtifacts,
  },
}));
vi.mock('../../src/services/conversationCentered/correctionResolutionService', () => ({
  correctionResolutionService: {
    detectCorrection: mocks.detectCorrection,
    autoResolveContradictions: mocks.autoResolveContradictions,
    processCorrection: vi.fn(async () => undefined),
  },
}));
vi.mock('../../src/services/conversationCentered/eventAssemblyService', () => ({
  eventAssemblyService: {
    assembleEvents: mocks.assembleEvents,
    reconcileEvent: vi.fn(async () => undefined),
  },
}));
vi.mock('../../src/services/entityRegistry', () => ({
  entityRegistry: { resolveManyById: mocks.resolveManyById },
}));
vi.mock('../../src/services/unifiedErIngestion', () => ({
  ingestConversationER: mocks.ingestConversationER,
}));
vi.mock('../../src/services/conversationCentered/threadIntelligenceService', () => ({
  threadIntelligenceService: { updateOnMessage: mocks.updateOnMessage },
}));
vi.mock('../../src/services/conversationCentered/threadSummaryService', () => ({
  threadSummaryService: { maybeRefresh: vi.fn(async () => undefined) },
}));
vi.mock('../../src/services/continuityRuntime/arcs/dayOccasionService', () => ({
  dayOccasionService: { processRecentDays: mocks.processRecentDays },
}));
vi.mock('../../src/services/groupCandidateService', () => ({
  groupCandidateService: { processChatMessage: mocks.processChatMessage },
}));
vi.mock('../../src/services/ingestion/shadowMode', () => ({
  shadowModeOrchestrator: { runShadow: mocks.runShadow },
}));

// omegaMemoryService is partially mocked in tests/setup.ts (extractEntities → []).
// Spy resolveEntities here so no real resolution/LLM runs.
import { omegaMemoryService } from '../../src/services/omegaMemoryService';
import { conversationIngestionPipeline } from '../../src/services/conversationCentered/ingestionPipeline';

function routeDefaults() {
  // conversation_messages: ensureMessageSaved → select/single miss, insert/single hit
  h.setRoute('conversation_messages', ({ op }) =>
    op === 'insert'
      ? { data: { id: 'conv-msg-1' }, error: null }
      : { data: null, error: null },
  );
  h.setRoute('utterances', ({ op }) =>
    op === 'insert'
      ? { data: { id: 'utt-1', created_at: new Date().toISOString() }, error: null }
      : { data: null, error: null },
  );
  h.setRoute('extracted_units', ({ op }) =>
    op === 'insert'
      ? {
          data: { id: 'eu-1', utterance_id: 'utt-1', confidence: 0.8, metadata: {} },
          error: null,
        }
      : { data: null, error: null },
  );
  // skills / social_communities relationship checks → empty lists
  h.setRoute('skills', () => ({ data: [], error: null }));
  h.setRoute('social_communities', () => ({ data: [], error: null }));
  h.setRoute('conversation_sessions', () => ({ data: null, error: null }));
}

describe('Ingestion pipeline E2E (ingestMessage → core)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.reset();
    routeDefaults();
    vi.spyOn(omegaMemoryService, 'resolveEntities').mockImplementation(
      mocks.resolveEntities as never,
    );
  });

  it('processes a simple single-utterance USER message end to end', async () => {
    const result = await conversationIngestionPipeline.ingestMessage(
      'user-1',
      'thread-1',
      'USER',
      'had coffee with friends',
    );

    expect(result.messageId).toBe('conv-msg-1');
    expect(result.utteranceIds).toEqual(['utt-1']);
    expect(result.unitIds).toEqual(['eu-1']);
    expect(mocks.splitIntoUtterances).toHaveBeenCalledWith('had coffee with friends');
    expect(mocks.extractSemanticUnits).toHaveBeenCalledTimes(1);
    expect(mocks.createKnowledgeUnit).toHaveBeenCalledTimes(1);
    expect(mocks.convertUnitsToMemoryArtifacts).toHaveBeenCalledTimes(1);
    // Event assembly is fired for produced units.
    expect(mocks.assembleEvents).toHaveBeenCalledWith('user-1', 'thread-1');
  });

  it('uses light refinement for USER and standard for AI messages', async () => {
    await conversationIngestionPipeline.ingestMessage('user-1', 'thread-1', 'USER', 'a user line');
    expect(mocks.normalizeText).toHaveBeenCalledWith('a user line', 'light');

    mocks.normalizeText.mockClear();
    await conversationIngestionPipeline.ingestMessage('user-1', 'thread-1', 'AI', 'an ai line');
    expect(mocks.normalizeText).toHaveBeenCalledWith('an ai line', 'standard');
  });

  it('handles multi-event messages by saving each split unit', async () => {
    mocks.splitEntryIntoEvents.mockResolvedValueOnce({
      events: [{ content: 'event one' }, { content: 'event two' }],
      spanish_terms: [],
    } as never);
    mocks.convertToExtractedUnits.mockReturnValueOnce([
      {
        type: 'EXPERIENCE',
        content: 'event one',
        confidence: 0.7,
        temporal_context: { start_time: new Date().toISOString() },
        entity_ids: [],
        metadata: {},
      },
      {
        type: 'EXPERIENCE',
        content: 'event two',
        confidence: 0.7,
        temporal_context: { start_time: new Date().toISOString() },
        entity_ids: [],
        metadata: {},
      },
    ] as never);
    // extracted_units insert returns a fresh id per call
    let n = 0;
    h.setRoute('extracted_units', ({ op }) =>
      op === 'insert'
        ? { data: { id: `eu-${++n}`, utterance_id: 'utt-1', confidence: 0.7, metadata: {} }, error: null }
        : { data: null, error: null },
    );

    const result = await conversationIngestionPipeline.ingestMessage(
      'user-1',
      'thread-1',
      'USER',
      'I did one thing. Then another thing.',
    );

    // Two split units were saved; the hybrid extractor must NOT run for split path.
    expect(result.unitIds).toEqual(['eu-1', 'eu-2']);
    expect(mocks.convertToExtractedUnits).toHaveBeenCalledTimes(1);
    expect(mocks.extractSemanticUnits).not.toHaveBeenCalled();
  });

  it('propagates a thrown error from message persistence', async () => {
    h.setRoute('conversation_messages', ({ op }) =>
      op === 'insert'
        ? { data: null, error: { message: 'insert failed' } }
        : { data: null, error: null },
    );

    await expect(
      conversationIngestionPipeline.ingestMessage('user-1', 'thread-1', 'USER', 'will fail'),
    ).rejects.toBeTruthy();
  });

  it('continues to a valid result even if knowledge-unit creation fails (non-blocking)', async () => {
    mocks.createKnowledgeUnit.mockRejectedValueOnce(new Error('KU service down'));

    const result = await conversationIngestionPipeline.ingestMessage(
      'user-1',
      'thread-1',
      'USER',
      'resilient message',
    );

    expect(result.unitIds).toEqual(['eu-1']);
  });
});
