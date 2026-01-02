import crypto from 'crypto';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

/**
 * Cache for chapter insights - expensive to compute, cache aggressively
 * Uses user ID + entry count as cache key (invalidates when entries change)
 */
class ChapterInsightsCacheService {
  private memoryCache: Map<string, { data: any; entryCount: number }> = new Map();
  private readonly MEMORY_CACHE_SIZE = 50; // Keep last 50 cached insights
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

  /**
   * Generate cache key from user ID
   */
  private getCacheKey(userId: string): string {
    return `chapter-insights:${userId}`;
  }

  /**
   * Get cached chapter insights
   */
  async getCachedInsights(userId: string): Promise<any | null> {
    const cacheKey = this.getCacheKey(userId);
    const cached = this.memoryCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check if entry count has changed (invalidate cache)
    try {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (count !== cached.entryCount) {
        // Entry count changed, invalidate cache
        this.memoryCache.delete(cacheKey);
        return null;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to check entry count for cache invalidation');
    }

    return cached.data;
  }

  /**
   * Cache chapter insights
   */
  async cacheInsights(userId: string, insights: any): Promise<void> {
    const cacheKey = this.getCacheKey(userId);
    
    // Get current entry count for cache invalidation
    let entryCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      entryCount = count || 0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get entry count for caching');
    }

    // If cache is full, remove oldest entry
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(cacheKey, {
      data: insights,
      entryCount
    });
  }

  /**
   * Clear cache for user
   */
  clearUserCache(userId: string): void {
    const cacheKey = this.getCacheKey(userId);
    this.memoryCache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.memoryCache.clear();
  }
}

export const chapterInsightsCacheService = new ChapterInsightsCacheService();

