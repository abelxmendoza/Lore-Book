import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock refs so vi.mock factories can use them
const { mockGetCachedEmbedding, mockCacheEmbedding, mockRouterEmbeddings } = vi.hoisted(() => ({
  mockGetCachedEmbedding: vi.fn(),
  mockCacheEmbedding: vi.fn(),
  mockRouterEmbeddings: vi.fn(),
}));

vi.mock('../../src/services/embeddingCacheService', () => ({
  embeddingCacheService: {
    getCachedEmbedding: (...args: any[]) => mockGetCachedEmbedding(...args),
    cacheEmbedding: (...args: any[]) => mockCacheEmbedding(...args),
  },
}));

// Embeddings go through ModelRouter (default OpenAI; local opt-in + fallback).
vi.mock('../../src/services/llm', () => ({
  getModelRouter: () => ({
    embeddings: (...args: any[]) => mockRouterEmbeddings(...args),
  }),
}));

vi.mock('../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    embeddingModel: 'text-embedding-3-small',
  },
}));

vi.mock('../../src/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/lib/messageCostTracker', () => ({
  recordEmbeddingCall: vi.fn(),
}));

vi.mock('../../src/lib/openaiCost', () => ({
  estimateUsdFromTokens: () => 0,
}));

vi.mock('../../src/services/costAttributionService', () => ({
  costAttributionService: { record: vi.fn() },
}));

import { embeddingService } from '../../src/services/embeddingService';

function mockEmbedOk(embedding: number[], model = 'text-embedding-3-small') {
  mockRouterEmbeddings.mockResolvedValue({
    result: {
      data: [{ embedding }],
      model,
      usage: { total_tokens: 4 },
    },
    meta: {
      capability: 'embedding',
      provider: 'openai',
      model,
      usedFallback: false,
      durationMs: 1,
    },
  });
}

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedEmbedding.mockResolvedValue(null);
    mockCacheEmbedding.mockResolvedValue(undefined);
  });

  describe('embedText', () => {
    it('should return cached embedding if available', async () => {
      const cachedEmbedding = [0.1, 0.2, 0.3];
      mockGetCachedEmbedding.mockResolvedValue(cachedEmbedding);

      const result = await embeddingService.embedText('test text');

      expect(result).toEqual(cachedEmbedding);
      expect(mockGetCachedEmbedding).toHaveBeenCalledWith('test text');
      expect(mockRouterEmbeddings).not.toHaveBeenCalled();
    });

    it('should call ModelRouter embeddings when not cached', async () => {
      const apiEmbedding = [0.4, 0.5, 0.6];
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbedOk(apiEmbedding);
      mockCacheEmbedding.mockResolvedValue(undefined);

      const result = await embeddingService.embedText('new text');

      expect(result).toEqual(apiEmbedding);
      expect(mockRouterEmbeddings).toHaveBeenCalledWith('embedding', {
        input: 'new text',
      });
      expect(mockCacheEmbedding).toHaveBeenCalledWith('new text', apiEmbedding);
    });

    it('should trim and limit input text', async () => {
      const longText = 'a'.repeat(10000);
      const trimmedText = longText.slice(0, 8000);
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbedOk([0.1]);

      await embeddingService.embedText(`  ${longText}  `);

      expect(mockRouterEmbeddings).toHaveBeenCalledWith('embedding', {
        input: trimmedText,
      });
    });

    it('should handle empty embedding response', async () => {
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockRouterEmbeddings.mockResolvedValue({
        result: { data: [{}], model: 'text-embedding-3-small' },
        meta: {
          capability: 'embedding',
          provider: 'openai',
          model: 'text-embedding-3-small',
          usedFallback: false,
          durationMs: 1,
        },
      });

      const result = await embeddingService.embedText('test');

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      const apiError = new Error('API Error');
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockRouterEmbeddings.mockRejectedValue(apiError);

      await expect(embeddingService.embedText('test')).rejects.toThrow('API Error');
    });

    it('should handle whitespace-only input', async () => {
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbedOk([0.1]);

      await embeddingService.embedText('   \n\t   ');

      expect(mockRouterEmbeddings).toHaveBeenCalledWith('embedding', {
        input: '',
      });
    });
  });
});
