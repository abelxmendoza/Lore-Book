import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

/**
 * Generates embeddings for toxicity events
 */
export class ToxicityEmbedding {
  /**
   * Generate embedding for toxicity event
   */
  async embed(event: { summary: string; category: string; pattern: string }): Promise<number[]> {
    try {
      const text = `${event.summary} ${event.category} ${event.pattern}`.trim();
      return await embeddingService.embedText(text);
    } catch (error) {
      logger.error({ error }, 'Error generating toxicity embedding');
      return [];
    }
  }
}

