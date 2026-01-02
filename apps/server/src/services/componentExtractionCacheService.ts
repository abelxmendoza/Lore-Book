import crypto from 'crypto';
import { logger } from '../logger';

/**
 * Cache for component extraction results - FREE, no API calls for cached content
 * Uses content hash as cache key - same content = same components
 */
class ComponentExtractionCacheService {
  private memoryCache: Map<string, any> = new Map();
  private readonly MEMORY_CACHE_SIZE = 500; // Keep last 500 extraction results in memory

  /**
   * Generate content hash for cache key
   */
  private hashContent(content: string): string {
    // Normalize content (trim, lowercase for comparison)
    const normalized = content.trim().toLowerCase().slice(0, 8000);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get cached component extraction result for content
   */
  async getCachedExtraction(content: string): Promise<{
    components: Array<{
      component_type: string;
      text: string;
      characters_involved: string[];
      location?: string | null;
      timestamp?: string | null;
      tags: string[];
      importance_score: number;
    }>;
    extractionConfidence: number;
  } | null> {
    const hash = this.hashContent(content);

    // Check memory cache first (fastest)
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash)!;
    }

    return null;
  }

  /**
   * Cache component extraction result for content
   */
  async cacheExtraction(
    content: string,
    result: {
      components: Array<{
        component_type: string;
        text: string;
        characters_involved: string[];
        location?: string | null;
        timestamp?: string | null;
        tags: string[];
        importance_score: number;
      }>;
      extractionConfidence: number;
    }
  ): Promise<void> {
    const hash = this.hashContent(content);

    // Store in memory cache
    this.setMemoryCache(hash, result);
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
   * Clear cache
   */
  clearCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.memoryCache.size,
      maxSize: this.MEMORY_CACHE_SIZE,
    };
  }
}

export const componentExtractionCacheService = new ComponentExtractionCacheService();

