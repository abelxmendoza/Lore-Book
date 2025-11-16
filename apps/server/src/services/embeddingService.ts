import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

const openai = new OpenAI({ apiKey: config.openAiKey });

class EmbeddingService {
  async embedText(input: string): Promise<number[]> {
    const cleaned = input.trim().slice(0, 8000);

    try {
      const response = await openai.embeddings.create({
        model: config.embeddingModel,
        input: cleaned
      });

      return response.data[0]?.embedding ?? [];
    } catch (error) {
      logger.error({ error }, 'Failed to embed text');
      throw error;
    }
  }
}

export const embeddingService = new EmbeddingService();
