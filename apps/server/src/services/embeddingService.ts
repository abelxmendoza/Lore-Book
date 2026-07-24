import { config } from '../config';
import { logger } from '../logger';
import { recordEmbeddingCall } from '../lib/messageCostTracker';
import { estimateUsdFromTokens } from '../lib/openaiCost';

import { costAttributionService } from './costAttributionService';
import { embeddingCacheService } from './embeddingCacheService';
import { getModelRouter } from './llm';

/**
 * Embeddings via ModelRouter (capability: embedding).
 * Default route is OpenAI (identical to pre-router). Local providers are
 * opt-in via LLM_EMBEDDING_PROVIDER; failures fall back to OpenAI when
 * LLM_FALLBACK_TO_OPENAI is enabled (default true).
 */
class EmbeddingService {
  async embedText(input: string): Promise<number[]> {
    const cleaned = input.trim().slice(0, 8000);

    // Try to get cached embedding first (FREE - no API call)
    const cached = await embeddingCacheService.getCachedEmbedding(cleaned);
    if (cached) {
      recordEmbeddingCall({ cacheHit: true });
      return cached;
    }

    // If not cached, call API (or local) and cache result
    try {
      const estTokens = Math.ceil(cleaned.length / 4);
      const { result: response, meta } = await getModelRouter().embeddings('embedding', {
        input: cleaned,
      });

      const modelUsed = meta.model || config.embeddingModel;
      recordEmbeddingCall({ cacheHit: false, model: modelUsed, tokens: estTokens });

      // Embeddings bypass the completion choke point — attribute their spend here.
      const tokens = response.usage?.total_tokens ?? estTokens;
      costAttributionService.record({
        operation: 'embedding',
        model: modelUsed,
        inputTokens: tokens,
        outputTokens: 0,
        usd: estimateUsdFromTokens(modelUsed, tokens, 0),
      });

      if (meta.usedFallback) {
        logger.info(
          { provider: meta.provider, model: modelUsed, durationMs: meta.durationMs },
          'embedding.used_openai_fallback',
        );
      }

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
