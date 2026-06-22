import { config } from '../config';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import { recordEmbeddingCall } from '../lib/messageCostTracker';
import { estimateUsdFromTokens } from '../lib/openaiCost';

import { costAttributionService } from './costAttributionService';
import { embeddingCacheService } from './embeddingCacheService';

class EmbeddingService {
  async embedText(input: string): Promise<number[]> {
    const cleaned = input.trim().slice(0, 8000);

    // Try to get cached embedding first (FREE - no API call)
    const cached = await embeddingCacheService.getCachedEmbedding(cleaned);
    if (cached) {
      recordEmbeddingCall({ cacheHit: true });
      return cached;
    }

    // If not cached, call API and cache result
    try {
      const estTokens = Math.ceil(cleaned.length / 4);
      recordEmbeddingCall({ cacheHit: false, model: config.embeddingModel, tokens: estTokens });
      const response = await openai.embeddings.create({
        model: config.embeddingModel,
        input: cleaned
      });

      // Embeddings bypass the completion choke point — attribute their spend here.
      const tokens = response.usage?.total_tokens ?? estTokens;
      costAttributionService.record({
        operation: 'embedding',
        model: config.embeddingModel,
        inputTokens: tokens,
        outputTokens: 0,
        usd: estimateUsdFromTokens(config.embeddingModel, tokens, 0),
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
