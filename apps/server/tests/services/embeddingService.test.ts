import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock refs so vi.mock factories can use them
const { mockGetCachedEmbedding, mockCacheEmbedding, mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockGetCachedEmbedding: vi.fn(),
  mockCacheEmbedding: vi.fn(),
  mockEmbeddingsCreate: vi.fn(),
}));

vi.mock('../../src/services/embeddingCacheService', () => ({
  embeddingCacheService: {
    getCachedEmbedding: (...args: any[]) => mockGetCachedEmbedding(...args),
    cacheEmbedding: (...args: any[]) => mockCacheEmbedding(...args),
  },
}));

// OpenAI must be a constructor; return instance with embeddings.create
vi.mock('openai', () => ({
  default: function OpenAI() {
    return {
      embeddings: {
        create: (...args: any[]) => mockEmbeddingsCreate(...args),
      },
    };
  },
}));

vi.mock('../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    embeddingModel: 'text-embedding-3-small'
  }
}));

vi.mock('../../src/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn()
  }
}));

import { embeddingService } from '../../src/services/embeddingService';

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
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('should call OpenAI API when not cached', async () => {
      const apiEmbedding = [0.4, 0.5, 0.6];
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: apiEmbedding }]
      });
      mockCacheEmbedding.mockResolvedValue(undefined);

      const result = await embeddingService.embedText('new text');

      expect(result).toEqual(apiEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'new text'
      });
      expect(mockCacheEmbedding).toHaveBeenCalledWith('new text', apiEmbedding);
    });

    it('should trim and limit input text', async () => {
      const longText = 'a'.repeat(10000);
      const trimmedText = longText.slice(0, 8000);
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }]
      });

      await embeddingService.embedText(`  ${longText}  `);

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: trimmedText
      });
    });

    it('should handle empty embedding response', async () => {
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{}] // No embedding property
      });

      const result = await embeddingService.embedText('test');

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      const apiError = new Error('API Error');
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbeddingsCreate.mockRejectedValue(apiError);

      await expect(embeddingService.embedText('test')).rejects.toThrow('API Error');
    });

    it('should handle whitespace-only input', async () => {
      mockGetCachedEmbedding.mockResolvedValue(null);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }]
      });

      await embeddingService.embedText('   \n\t   ');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ''
      });
    });
  });
});

