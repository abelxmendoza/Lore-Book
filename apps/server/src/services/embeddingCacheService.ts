import crypto from 'crypto';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

/**
 * Aggressive caching for embeddings - NO API CALLS for cached content
 * Uses content hash as cache key - same content = same embedding
 */
class EmbeddingCacheService {
  private memoryCache: Map<string, number[]> = new Map();
  private readonly MEMORY_CACHE_SIZE = 500; // Keep last 500 embeddings in memory

  /**
   * Generate content hash for cache key
   */
  private hashContent(content: string): string {
    // Normalize content (trim, lowercase for comparison)
    const normalized = content.trim().slice(0, 8000).toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get cached embedding for content
   */
  async getCachedEmbedding(content: string): Promise<number[] | null> {
    const hash = this.hashContent(content);

    // Check memory cache first (fastest)
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash)!;
    }

    // Check database cache (embeddings table)
    try {
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('embedding')
        .eq('user_id', 'cache') // Use special user_id for cached embeddings
        .eq('id', hash)
        .single();

      if (!error && data && data.embedding) {
        const embedding = data.embedding as number[];
        // Store in memory cache
        this.setMemoryCache(hash, embedding);
        return embedding;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to check database cache for embedding');
    }

    return null;
  }

  /**
   * Cache embedding for content
   */
  async cacheEmbedding(content: string, embedding: number[]): Promise<void> {
    const hash = this.hashContent(content);

    // Store in memory cache
    this.setMemoryCache(hash, embedding);

    // Store in database cache (fire and forget)
    // Note: We could create a dedicated embeddings_cache table, but for now
    // we'll use a special approach - store in a temp table or use metadata
    // For simplicity, we'll just use memory cache for now
    // Database storage can be added later if needed
  }

  /**
   * Set memory cache with size limit
   */
  private setMemoryCache(key: string, value: number[]): void {
    // If cache is full, remove oldest entry (simple FIFO)
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(key, value);
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.memoryCache.size,
      maxSize: this.MEMORY_CACHE_SIZE
    };
  }
}

export const embeddingCacheService = new EmbeddingCacheService();

