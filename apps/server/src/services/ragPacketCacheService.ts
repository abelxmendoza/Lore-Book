import crypto from 'crypto';

import { logger } from '../logger';

/**
 * Cache for RAG packets - expensive to build, so cache aggressively
 * Uses message hash + user ID as cache key
 */
class RAGPacketCacheService {
  private memoryCache: Map<string, any> = new Map();
  private readonly MEMORY_CACHE_SIZE = 100; // Keep last 100 RAG packets in memory
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  /**
   * Generate cache key from user ID and message
   */
  private hashMessage(userId: string, message: string): string {
    const normalized = message.trim().toLowerCase().slice(0, 500);
    const key = `${userId}:${normalized}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Get cached RAG packet
   */
  getCachedPacket(userId: string, message: string): any | null {
    const hash = this.hashMessage(userId, message);
    const cached = this.memoryCache.get(hash);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    
    // Remove expired entry
    if (cached) {
      this.memoryCache.delete(hash);
    }
    
    return null;
  }

  /**
   * Cache RAG packet
   */
  cachePacket(userId: string, message: string, packet: any): void {
    const hash = this.hashMessage(userId, message);
    
    // If cache is full, remove oldest entry
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    
    this.memoryCache.set(hash, {
      data: packet,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
      cachedAt: Date.now()
    });
  }

  /**
   * Clear cache for user (when entries are updated)
   */
  clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.data?.userId === userId) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.memoryCache.delete(key));
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlMinutes: number } {
    return {
      size: this.memoryCache.size,
      maxSize: this.MEMORY_CACHE_SIZE,
      ttlMinutes: this.CACHE_TTL_MS / (60 * 1000)
    };
  }
}

export const ragPacketCacheService = new RAGPacketCacheService();

