import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbedText = vi.fn();
const mockBm25Search = vi.fn();
const mockRewriteQuery = vi.fn();
const mockRouteQuery = vi.fn();
const mockDetectTemporalType = vi.fn();
const mockCalculateWeight = vi.fn();
const mockFrom = vi.fn();
const mockGetEngineResults = vi.fn();

vi.mock('../../src/services/embeddingService', () => ({ embeddingService: { embedText: (...a: unknown[]) => mockEmbedText(...a) } }));
vi.mock('../../src/services/rag/bm25Search', () => ({ bm25Search: { search: (...a: unknown[]) => mockBm25Search(...a) } }));
vi.mock('../../src/services/rag/queryRewriter', () => ({ queryRewriter: { rewriteQuery: (...a: unknown[]) => mockRewriteQuery(...a) } }));
vi.mock('../../src/services/rag/intentRouter', () => ({ intentRouter: { routeQuery: (...a: unknown[]) => mockRouteQuery(...a) } }));
vi.mock('../../src/services/rag/temporalWeighting', () => ({
  temporalWeighting: {
    detectTemporalType: (...a: unknown[]) => mockDetectTemporalType(...a),
    calculateWeight: (...a: unknown[]) => mockCalculateWeight(...a),
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a) } }));
vi.mock('../../src/engineRuntime/storage', () => ({ getEngineResults: (...a: unknown[]) => mockGetEngineResults(...a) }));

// Stub other deps used by retrieve/enhancedRetrieve to avoid import errors
vi.mock('../../src/services/rag/entityRelationshipBoosting', () => ({ entityRelationshipBoosting: { boostByEntities: vi.fn((x: unknown) => x) } }));
vi.mock('../../src/services/rag/reranker', () => ({ reranker: { rerank: vi.fn((_q: unknown, x: unknown) => x), reciprocalRankFusion: vi.fn((x: unknown[]) => (x[0] || []).map((r: { id: string }) => ({ id: r.id, score: 1 }))) } }));
vi.mock('../../src/services/rag/contextCompressor', () => ({ contextCompressor: {} }));
vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { MemoryRetriever } from '../../src/services/chat/memoryRetriever';

describe('MemoryRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEngineResults.mockResolvedValue({});
    mockRewriteQuery.mockResolvedValue({ original: 'recent', entities: [] });
    mockRouteQuery.mockResolvedValue({
      method: 'temporal',
      weights: { semantic: 0.4, keyword: 0.4, entity: 0.1, temporal: 0.1 },
      useReranking: false,
      useCompression: false,
    });
    mockDetectTemporalType.mockReturnValue('recent');
    mockCalculateWeight.mockReturnValue(1.0);
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      score: 0.9,
      content: `content ${i}`,
    }));
    mockBm25Search.mockResolvedValue(twenty);
    const twentyEntries = twenty.map(({ id }) => ({
      id,
      date: new Date().toISOString(),
      content: 'x',
      tags: [],
      embedding: null,
    }));
    const thenable = { then: (f: (v: { data: unknown }) => void) => { f({ data: [] }); return { catch: () => {} }; } };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: twentyEntries }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          ...thenable,
        }),
      }),
    });
  });

  it('Tier 1 (keyword-first): when sufficient, does not call embeddingService.embedText', async () => {
    const retriever = new MemoryRetriever();
    await retriever.retrieve('user-1', 20, 'recent stuff', []);

    expect(mockEmbedText).not.toHaveBeenCalled();
    expect(mockBm25Search).toHaveBeenCalledWith('user-1', 'recent', 40, expect.any(Number));
  });
});
