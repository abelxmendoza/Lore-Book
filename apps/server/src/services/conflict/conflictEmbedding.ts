import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

/**
 * Generates embeddings for conflicts
 */
export class ConflictEmbedding {
  /**
   * Generate embedding for conflict
   */
  async embed(conflict: { summary: string; trigger: string; outcome: string }): Promise<number[]> {
    try {
      const text = `${conflict.summary} ${conflict.trigger} ${conflict.outcome}`.trim();
      return await embeddingService.embedText(text);
    } catch (error) {
      logger.error({ error }, 'Error generating conflict embedding');
      return [];
    }
  }
}

