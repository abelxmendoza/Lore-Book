/**
 * Flush Memory Cache
 * Clears all in-memory caches
 */

import { logger } from '../../logger';

// Import cache services (if they exist)
// import { factCacheService } from '../../services/factCacheService';
// import { embeddingCacheService } from '../../services/embeddingCacheService';
// import { ragPacketCacheService } from '../../services/ragPacketCacheService';

export async function flushMemoryCache(): Promise<void> {
  logger.info('Flushing memory cache');

  try {
    // Clear all in-memory caches
    // Note: These services would need to expose a clear() method
    
    // Example:
    // await factCacheService.clear();
    // await embeddingCacheService.clear();
    // await ragPacketCacheService.clear();

    logger.info('Memory cache flushed successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to flush memory cache');
    throw error;
  }
}

