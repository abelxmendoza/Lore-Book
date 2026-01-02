import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';

/**
 * Cache for memoir outlines - expensive to generate, cache aggressively
 * Invalidates when entries change
 */
class MemoirCacheService {
  private memoryCache: Map<string, { data: any; entryCount: number; lastUpdated: string }> = new Map();
  private readonly MEMORY_CACHE_SIZE = 50;

  private getCacheKey(userId: string): string {
    return `memoir:${userId}`;
  }

  async getCachedMemoir(userId: string): Promise<any | null> {
    const cacheKey = this.getCacheKey(userId);
    const cached = this.memoryCache.get(cacheKey);
    
    if (!cached) return null;

    // Check if entries changed since cache
    try {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (count !== cached.entryCount) {
        this.memoryCache.delete(cacheKey);
        return null;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to check entry count');
    }

    return cached.data;
  }

  async cacheMemoir(userId: string, memoir: any): Promise<void> {
    const cacheKey = this.getCacheKey(userId);
    
    let entryCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      entryCount = count || 0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get entry count');
    }

    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(cacheKey, {
      data: memoir,
      entryCount,
      lastUpdated: new Date().toISOString()
    });
  }

  clearUserCache(userId: string): void {
    this.memoryCache.delete(this.getCacheKey(userId));
  }
}

export const memoirCacheService = new MemoirCacheService();

