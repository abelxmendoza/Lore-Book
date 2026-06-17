import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPersist = vi.fn();
const mockLexicalAnalyze = vi.fn();
const mockMeaningResolve = vi.fn();
const mockEnrichLexical = vi.fn();
const mockEnrichMeaning = vi.fn();
const mockProcessMemory = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../src/services/lexical/lexicalAnalyzerService', () => ({
  lexicalAnalyzerService: { analyzeMessage: (...args: unknown[]) => mockLexicalAnalyze(...args) },
}));

vi.mock('../../src/services/meaning/meaningResolutionService', () => ({
  meaningResolutionService: {
    resolveAndIntegrate: (...args: unknown[]) => mockMeaningResolve(...args),
    allowsMemoryWrite: () => true,
  },
}));

vi.mock('../../src/services/ontology/ontologyEnrichmentService', () => ({
  enrichFromLexicalAnalysisAsync: (...args: unknown[]) => mockEnrichLexical(...args),
  enrichFromMeaningResolutionAsync: (...args: unknown[]) => mockEnrichMeaning(...args),
}));

vi.mock('../../src/services/lexical/lexicalMemoryBridge', () => ({
  processLexicalMemoryCandidates: (...args: unknown[]) => mockProcessMemory(...args),
}));

vi.mock('../../src/services/ontology/relationshipPersistenceService', () => ({
  relationshipPersistenceService: {
    persistFromInterpretation: (...args: unknown[]) => mockPersist(...args),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { runLoreInterpretationPipeline } from '../../src/services/pipeline/loreInterpretationPipeline';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'update']) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

describe('loreInterpretationPipeline relationship persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLexicalAnalyze.mockReturnValue({
      messageId: 'msg-1',
      userId: 'user-1',
      rawText: 'My cousin Marcus works at Acme.',
      normalizedText: 'my cousin marcus works at acme.',
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
      entityLinks: [{ subject: 'self', object: 'Marcus', relationshipType: 'CO_MENTIONED_WITH', scope: 'FAMILY', cue: 'cousin', confidence: 0.9 }],
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    });
    mockMeaningResolve.mockResolvedValue({
      messageId: 'msg-1',
      userId: 'user-1',
      rawText: 'My cousin Marcus works at Acme.',
      confidence: 0.9,
      factuality: 'asserted',
      resolvedEntities: [],
      resolvedRelationships: [],
      resolvedSkills: [],
      resolvedPlaces: [],
      resolvedEvents: [],
      resolvedReferences: [],
      identityCollisions: [],
      contradictions: [],
      ambiguities: [],
      ontologyActionCandidates: [],
      memoryReviewCandidates: [],
    });
    mockEnrichLexical.mockResolvedValue({ relationship_groups: [{ scope: 'FAMILY', entityNames: ['Marcus'] }] });
    mockEnrichMeaning.mockResolvedValue({});
    mockPersist.mockResolvedValue({ persisted: 1, skipped: 0, characterEdges: 0, entityEdges: 1 });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lexical_analysis_results') {
        return chain({ data: { id: 'lex-1' }, error: null });
      }
      if (table === 'chat_messages') {
        return chain({ data: { metadata: {} }, error: null });
      }
      return chain({ data: null, error: null });
    });
  });

  it('persists relationship links after meaning resolution', async () => {
    await runLoreInterpretationPipeline({
      userId: 'user-1',
      messageId: 'msg-1',
      text: 'My cousin Marcus works at Acme.',
    });

    expect(mockPersist).toHaveBeenCalledWith(
      'user-1',
      'msg-1',
      expect.objectContaining({ entityLinks: expect.any(Array) }),
      expect.objectContaining({ messageId: 'msg-1' })
    );
  });

  it('records relationship persistence stats on the message when edges are saved', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lexical_analysis_results') return chain({ data: { id: 'lex-1' }, error: null });
      if (table === 'chat_messages') {
        const b = chain({ data: { metadata: { interpretation_pipeline: { version: 2 } } }, error: null });
        b.update = update;
        return b;
      }
      return chain({ data: null, error: null });
    });

    await runLoreInterpretationPipeline({
      userId: 'user-1',
      messageId: 'msg-1',
      text: 'My cousin Marcus works at Acme.',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          relationship_persistence: expect.objectContaining({ persisted: 1 }),
        }),
      })
    );
  });
});
