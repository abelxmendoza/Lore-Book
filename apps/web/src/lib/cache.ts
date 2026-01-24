/**
 * API Response Caching
 * 
 * Provides in-memory caching for API responses to reduce server load
 * and improve performance. Cache is automatically invalidated on mutations.
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  expiresAt: number;
};

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttl || this.defaultTTL);

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    });
  }

  /**
   * Delete cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all cache entries matching a pattern
   */
  deletePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*'))
      : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export const apiCache = new APICache();

// Cleanup expired entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanup();
  }, 60 * 1000);
}

/**
 * Generate cache key from URL and options
 */
export const generateCacheKey = (url: string, options?: RequestInit): string => {
  const method = options?.method || 'GET';
  const body = options?.body
    ? typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
    : '';
  return `${method}:${url}:${body}`;
};

/**
 * Cache-aware fetch wrapper
 */
export const cachedFetch = async <T>(
  url: string,
  options?: RequestInit,
  cacheOptions?: {
    ttl?: number;
    useCache?: boolean;
    invalidatePattern?: string | RegExp;
  }
): Promise<T> => {
  const { ttl, useCache = true, invalidatePattern } = cacheOptions || {};

  // Invalidate cache if pattern matches
  if (invalidatePattern) {
    apiCache.deletePattern(invalidatePattern);
  }

  // Check cache for GET requests
  if (useCache && (!options?.method || options.method === 'GET')) {
    const cacheKey = generateCacheKey(url, options);
    const cached = apiCache.get<T>(cacheKey);
    
    if (cached !== null) {
      return cached;
    }
  }

  // Make actual request
  const response = await fetch(url, options);
  const data = await response.json() as T;

  // Cache successful GET requests
  if (useCache && response.ok && (!options?.method || options.method === 'GET')) {
    const cacheKey = generateCacheKey(url, options);
    apiCache.set(cacheKey, data, ttl);
  }

  // Invalidate related cache on mutations
  if (options?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    // Invalidate related endpoints
    const urlPattern = url.split('?')[0]; // Remove query params
    apiCache.deletePattern(new RegExp(urlPattern.replace(/\/[^/]+$/, '/.*')));
  }

  return data;
};


