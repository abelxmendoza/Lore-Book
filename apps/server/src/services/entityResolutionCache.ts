// =====================================================
// ENTITY RESOLUTION CACHE
// Purpose: Cache resolved entities to reduce API costs and improve consistency
// Expected Impact: 50-70% faster entity resolution, 30% cost reduction
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

export type CachedEntityResolution = {
  id: string;
  user_id: string;
  entity_name: string;
  resolved_entity_id: string | null;
  entity_type: string | null;
  confidence: number | null;
  aliases: string[];
  access_count: number;
  last_accessed_at: string;
};

export type EntityResolutionInput = {
  entity_name: string;
  resolved_entity_id?: string | null;
  entity_type?: string | null;
  confidence?: number;
  aliases?: string[];
};

/**
 * Caches entity resolutions to avoid repeated API calls
 */
export class EntityResolutionCache {
  private memoryCache: Map<string, CachedEntityResolution> = new Map();
  private readonly MEMORY_CACHE_SIZE = 1000; // Keep last 1000 resolutions in memory

  /**
   * Get cached entity resolution
   */
  async getCachedResolution(
    userId: string,
    entityName: string
  ): Promise<CachedEntityResolution | null> {
    const cacheKey = `${userId}:${entityName.toLowerCase().trim()}`;

    // Check memory cache first
    if (this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey)!;
      // Update access stats (fire and forget)
      this.updateAccessStats(cached.id, userId).catch(() => {
        // Silently handle errors
      });
      return cached;
    }

    // Check database cache
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_resolution_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_name', entityName.toLowerCase().trim())
        .single();

      if (!error && data) {
        const resolution: CachedEntityResolution = {
          id: data.id,
          user_id: data.user_id,
          entity_name: data.entity_name,
          resolved_entity_id: data.resolved_entity_id,
          entity_type: data.entity_type,
          confidence: data.confidence,
          aliases: data.aliases || [],
          access_count: data.access_count || 0,
          last_accessed_at: data.last_accessed_at,
        };

        // Store in memory cache
        this.setMemoryCache(cacheKey, resolution);

        // Update access stats
        await this.updateAccessStats(resolution.id, userId);

        return resolution;
      }
    } catch (error) {
      logger.debug({ error, userId, entityName }, 'Failed to check entity resolution cache');
    }

    return null;
  }

  /**
   * Cache entity resolution
   */
  async cacheResolution(
    userId: string,
    resolution: EntityResolutionInput
  ): Promise<CachedEntityResolution> {
    const entityName = resolution.entity_name.toLowerCase().trim();
    const cacheKey = `${userId}:${entityName}`;

    // Prepare data for upsert
    const cacheData = {
      user_id: userId,
      entity_name: entityName,
      resolved_entity_id: resolution.resolved_entity_id || null,
      entity_type: resolution.entity_type || null,
      confidence: resolution.confidence || null,
      aliases: resolution.aliases || [],
      access_count: 1,
      last_accessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      // Upsert to database
      const { data, error } = await supabaseAdmin
        .from('entity_resolution_cache')
        .upsert(
          cacheData,
          {
            onConflict: 'user_id,entity_name',
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      const cached: CachedEntityResolution = {
        id: data.id,
        user_id: data.user_id,
        entity_name: data.entity_name,
        resolved_entity_id: data.resolved_entity_id,
        entity_type: data.entity_type,
        confidence: data.confidence,
        aliases: data.aliases || [],
        access_count: data.access_count || 1,
        last_accessed_at: data.last_accessed_at,
      };

      // Store in memory cache
      this.setMemoryCache(cacheKey, cached);

      return cached;
    } catch (error) {
      logger.warn({ error, userId, entityName }, 'Failed to cache entity resolution');
      // Return a basic cached object even if DB write fails
      return {
        id: '',
        user_id: userId,
        entity_name: entityName,
        resolved_entity_id: resolution.resolved_entity_id || null,
        entity_type: resolution.entity_type || null,
        confidence: resolution.confidence || null,
        aliases: resolution.aliases || [],
        access_count: 1,
        last_accessed_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Update access statistics
   */
  private async updateAccessStats(cacheId: string, userId: string): Promise<void> {
    // Get current count first, then update
    try {
      const { data } = await supabaseAdmin
        .from('entity_resolution_cache')
        .select('access_count')
        .eq('id', cacheId)
        .eq('user_id', userId)
        .single();

      if (data) {
        await supabaseAdmin
          .from('entity_resolution_cache')
          .update({
            access_count: (data.access_count || 0) + 1,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('id', cacheId)
          .eq('user_id', userId);
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  /**
   * Invalidate cache entry (when entity is updated)
   */
  async invalidateResolution(userId: string, entityName: string): Promise<void> {
    const cacheKey = `${userId}:${entityName.toLowerCase().trim()}`;
    this.memoryCache.delete(cacheKey);

    try {
      await supabaseAdmin
        .from('entity_resolution_cache')
        .delete()
        .eq('user_id', userId)
        .eq('entity_name', entityName.toLowerCase().trim());
    } catch (error) {
      logger.warn({ error, userId, entityName }, 'Failed to invalidate entity resolution cache');
    }
  }

  /**
   * Invalidate all resolutions for an entity (when entity is merged/deleted)
   */
  async invalidateEntityResolutions(userId: string, entityId: string): Promise<void> {
    // Remove from memory cache
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.resolved_entity_id === entityId && value.user_id === userId) {
        this.memoryCache.delete(key);
      }
    }

    try {
      await supabaseAdmin
        .from('entity_resolution_cache')
        .delete()
        .eq('user_id', userId)
        .eq('resolved_entity_id', entityId);
    } catch (error) {
      logger.warn({ error, userId, entityId }, 'Failed to invalidate entity resolutions');
    }
  }

  /**
   * Add alias to cached resolution
   */
  async addAlias(userId: string, entityName: string, alias: string): Promise<void> {
    const cached = await this.getCachedResolution(userId, entityName);
    if (!cached) return;

    const aliases = [...(cached.aliases || []), alias];
    const uniqueAliases = [...new Set(aliases)];

    try {
      await supabaseAdmin
        .from('entity_resolution_cache')
        .update({
          aliases: uniqueAliases,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cached.id);

      // Update memory cache
      const cacheKey = `${userId}:${entityName.toLowerCase().trim()}`;
      if (this.memoryCache.has(cacheKey)) {
        const memCached = this.memoryCache.get(cacheKey)!;
        memCached.aliases = uniqueAliases;
      }
    } catch (error) {
      logger.warn({ error, userId, entityName, alias }, 'Failed to add alias to cache');
    }
  }

  /**
   * Find resolution by alias
   */
  async findByAlias(userId: string, alias: string): Promise<CachedEntityResolution | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_resolution_cache')
        .select('*')
        .eq('user_id', userId)
        .contains('aliases', [alias.toLowerCase().trim()])
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const resolution: CachedEntityResolution = {
        id: data.id,
        user_id: data.user_id,
        entity_name: data.entity_name,
        resolved_entity_id: data.resolved_entity_id,
        entity_type: data.entity_type,
        confidence: data.confidence,
        aliases: data.aliases || [],
        access_count: data.access_count || 0,
        last_accessed_at: data.last_accessed_at,
      };

      // Cache in memory
      const cacheKey = `${userId}:${data.entity_name.toLowerCase().trim()}`;
      this.setMemoryCache(cacheKey, resolution);

      return resolution;
    } catch (error) {
      logger.debug({ error, userId, alias }, 'Failed to find resolution by alias');
      return null;
    }
  }

  /**
   * Set memory cache with size limit
   */
  private setMemoryCache(key: string, value: CachedEntityResolution): void {
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
      maxSize: this.MEMORY_CACHE_SIZE,
    };
  }

  /**
   * Get most frequently accessed resolutions
   */
  async getTopAccessedResolutions(
    userId: string,
    limit: number = 100
  ): Promise<CachedEntityResolution[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_resolution_cache')
        .select('*')
        .eq('user_id', userId)
        .order('access_count', { ascending: false })
        .limit(limit);

      if (error) {
        logger.warn({ error }, 'Failed to get top accessed resolutions');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        entity_name: row.entity_name,
        resolved_entity_id: row.resolved_entity_id,
        entity_type: row.entity_type,
        confidence: row.confidence,
        aliases: row.aliases || [],
        access_count: row.access_count || 0,
        last_accessed_at: row.last_accessed_at,
      }));
    } catch (error) {
      logger.warn({ error }, 'Failed to get top accessed resolutions');
      return [];
    }
  }
}

export const entityResolutionCache = new EntityResolutionCache();
