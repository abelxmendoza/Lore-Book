import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));

import { embeddingCacheService } from '../../src/services/embeddingCacheService';

describe('EmbeddingCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embeddingCacheService.clearMemoryCache();
    // DB select: return no row (cache miss from DB)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(undefined),
      }),
      upsert: vi.fn().mockReturnValue({
        then: (fn: () => void) => {
          fn();
          return { catch: () => {} };
        },
      }),
    });
  });

  describe('TinyLFU-like eviction', () => {
    it('evicts low accessCount entry when full (not a frequently-accessed one)', async () => {
      // Fill to 500 via cacheEmbedding (setMemoryCache only; eviction happens on 501st)
      const emb = [0.1];
      for (let i = 0; i < 500; i++) {
        await embeddingCacheService.cacheEmbedding(`content-${i}`, emb);
      }
      // Bump accessCount for "content-0" so it won't be evicted
      for (let i = 0; i < 50; i++) {
        const hit = await embeddingCacheService.getCachedEmbedding('content-0');
        expect(hit).toEqual(emb);
      }
      // content-1..content-499 have accessCount 1. Eviction picks min(accessCount) then min(lastAccess).
      // content-1 has the oldest lastAccess among those with accessCount 1.
      // Add 501st to trigger eviction; content-1 should be evicted.
      await embeddingCacheService.cacheEmbedding('content-500', emb);

      // content-1 should be evicted: memory miss, then DB miss (mock returns null)
      const got = await embeddingCacheService.getCachedEmbedding('content-1');
      expect(got).toBeNull();
      // content-0 was frequently accessed and should still be present
      expect(await embeddingCacheService.getCachedEmbedding('content-0')).toEqual(emb);
    });
  });
});
