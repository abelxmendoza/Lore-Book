import crypto from 'crypto';

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

type CacheEntry = { embedding: number[]; accessCount: number; lastAccess: number };

/**
 * Aggressive caching for embeddings - NO API CALLS for cached content
 * Uses content hash as cache key - same content = same embedding
 * Evicts by access count then recency (TinyLFU-like) so hot hashes stay.
 */
class EmbeddingCacheService {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private readonly MEMORY_CACHE_SIZE = 500; // Keep last 500 embeddings in memory
  
  // Cache metrics
  private hitCount = 0;
  private missCount = 0;
  private memoryHitCount = 0;
  private dbHitCount = 0;

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
    const mem = this.memoryCache.get(hash);
    if (mem) {
      this.hitCount++;
      this.memoryHitCount++;
      mem.accessCount++;
      mem.lastAccess = Date.now();
      return mem.embedding;
    }

    // Check database cache (embeddings_cache table)
    try {
      const { data, error } = await supabaseAdmin
        .from('embeddings_cache')
        .select('embedding, access_count')
        .eq('content_hash', hash)
        .single();

      if (!error && data && data.embedding) {
        const embedding = data.embedding as number[];
        
        // Update access statistics (fire and forget)
        supabaseAdmin
          .from('embeddings_cache')
          .update({
            access_count: (data.access_count || 0) + 1,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('content_hash', hash)
          .then(() => {
            // Silently handle errors
          })
          .catch(() => {
            // Silently handle errors
          });
        
        // Store in memory cache for faster future access
        this.setMemoryCache(hash, embedding);
        
        this.hitCount++;
        this.dbHitCount++;
        return embedding;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to check database cache for embedding');
    }

    this.missCount++;
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
    supabaseAdmin
      .from('embeddings_cache')
      .upsert({
        content_hash: hash,
        embedding: embedding,
        access_count: 1,
        last_accessed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'content_hash',
        ignoreDuplicates: false,
      })
      .then(() => {
        // Silently handle success
      })
      .catch((error) => {
        logger.debug({ error, hash }, 'Failed to cache embedding in database (non-blocking)');
      });
  }

  /**
   * Set memory cache with size limit. Evicts by accessCount then lastAccess (TinyLFU-like).
   */
  private setMemoryCache(key: string, embedding: number[]): void {
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      let victimKey: string | null = null;
      let minCount = Infinity;
      let minAccess = Infinity;
      for (const [k, v] of this.memoryCache) {
        if (v.accessCount < minCount || (v.accessCount === minCount && v.lastAccess < minAccess)) {
          minCount = v.accessCount;
          minAccess = v.lastAccess;
          victimKey = k;
        }
      }
      if (victimKey) this.memoryCache.delete(victimKey);
    }
    this.memoryCache.set(key, { embedding, accessCount: 1, lastAccess: Date.now() });
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
  getCacheStats(): { 
    size: number; 
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    memoryHits: number;
    dbHits: number;
  } {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? this.hitCount / total : 0;
    
    return {
      size: this.memoryCache.size,
      maxSize: this.MEMORY_CACHE_SIZE,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: hitRate,
      memoryHits: this.memoryHitCount,
      dbHits: this.dbHitCount,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.memoryHitCount = 0;
    this.dbHitCount = 0;
  }

  /**
   * Warm cache with common patterns
   * Pre-loads frequently used embeddings
   */
  async warmCache(commonTexts: string[]): Promise<void> {
    logger.info({ count: commonTexts.length }, 'Warming embedding cache');
    
    for (const text of commonTexts) {
      const hash = this.hashContent(text);
      
      // Check if already cached
      const cached = await this.getCachedEmbedding(text);
      if (cached) {
        continue; // Already cached
      }
      
      // Note: This doesn't generate embeddings, just checks cache
      // Actual embedding generation should be done by embeddingService
    }
    
    logger.info('Cache warming complete');
  }

  /**
   * Get most frequently accessed embeddings (for cache optimization)
   */
  async getTopAccessedEmbeddings(limit: number = 100): Promise<Array<{ content_hash: string; access_count: number }>> {
    try {
      const { data, error } = await supabaseAdmin
        .from('embeddings_cache')
        .select('content_hash, access_count')
        .order('access_count', { ascending: false })
        .limit(limit);

      if (error) {
        logger.warn({ error }, 'Failed to get top accessed embeddings');
        return [];
      }

      return data || [];
    } catch (error) {
      logger.warn({ error }, 'Failed to get top accessed embeddings');
      return [];
    }
  }
}

export const embeddingCacheService = new EmbeddingCacheService();

