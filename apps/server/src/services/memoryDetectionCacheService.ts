import crypto from 'crypto';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

/**
 * Cache for memory detection results - FREE, no API calls for cached content
 * Uses content hash as cache key - same content = same detection result
 */
class MemoryDetectionCacheService {
  private memoryCache: Map<string, any> = new Map();
  private readonly MEMORY_CACHE_SIZE = 500; // Keep last 500 detection results in memory

  /**
   * Generate content hash for cache key
   */
  private hashContent(content: string): string {
    // Normalize content (trim, lowercase for comparison)
    const normalized = content.trim().toLowerCase().slice(0, 8000);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get cached detection result for content
   */
  async getCachedDetection(content: string): Promise<{
    isMemoryWorthy: boolean;
    confidence: number;
    detectedPatterns: string[];
    reasons: string[];
  } | null> {
    const hash = this.hashContent(content);

    // Check memory cache first (fastest)
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash)!;
    }

    // Check database cache (conversation_messages metadata or dedicated cache table)
    // For now, we'll use memory cache only - can extend to database later if needed
    return null;
  }

  /**
   * Cache detection result for content
   */
  async cacheDetection(
    content: string,
    result: {
      isMemoryWorthy: boolean;
      confidence: number;
      detectedPatterns: string[];
      reasons: string[];
    }
  ): Promise<void> {
    const hash = this.hashContent(content);

    // Store in memory cache
    this.setMemoryCache(hash, result);

    // Could store in database cache table if needed (future optimization)
  }

  /**
   * Set memory cache with LRU eviction
   */
  private setMemoryCache(key: string, value: any): void {
    // If cache is full, remove oldest entry (simple FIFO eviction)
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, value);
  }

  /**
   * Clear cache for user (if needed)
   */
  clearCache(): void {
    this.memoryCache.clear();
  }
}

export const memoryDetectionCacheService = new MemoryDetectionCacheService();

