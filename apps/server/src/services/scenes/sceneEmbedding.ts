import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

/**
 * Generates embeddings for scenes
 */
export class SceneEmbedding {
  /**
   * Generate embedding for scene
   */
  async embed(scene: { summary: string; title: string }): Promise<number[]> {
    try {
      const text = `${scene.title} ${scene.summary}`.trim();
      return await embeddingService.embedText(text);
    } catch (error) {
      logger.error({ error }, 'Error generating scene embedding');
      return [];
    }
  }
}

