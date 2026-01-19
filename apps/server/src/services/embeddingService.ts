import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { embeddingCacheService } from './embeddingCacheService';

const openai = new OpenAI({ apiKey: config.openAiKey });

class EmbeddingService {
  async embedText(input: string): Promise<number[]> {
    const cleaned = input.trim().slice(0, 8000);

    // Try to get cached embedding first (FREE - no API call)
    const cached = await embeddingCacheService.getCachedEmbedding(cleaned);
    if (cached) {
      return cached;
    }

    // If not cached, call API and cache result
    try {
      const response = await openai.embeddings.create({
        model: config.embeddingModel,
        input: cleaned
      });

      const embedding = response.data[0]?.embedding ?? [];
      
      // Cache the embedding for future use (fire and forget)
      embeddingCacheService.cacheEmbedding(cleaned, embedding).catch(err =>
        logger.debug({ error: err }, 'Failed to cache embedding')
      );

      return embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to embed text');
      throw error;
    }
  }
}

export const embeddingService = new EmbeddingService();
