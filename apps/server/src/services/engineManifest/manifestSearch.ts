import OpenAI from 'openai';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { EngineSearchResult } from './manifestTypes';

/**
 * Search across all engine blueprints via embeddings
 */
export class ManifestSearch {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Search engines by query
   */
  async search(query: string, limit: number = 10): Promise<EngineSearchResult[]> {
    try {
      logger.debug({ query, limit }, 'Searching engines');

      // Create query embedding
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: query,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search using database function
      const { data, error } = await supabaseAdmin.rpc('semantic_search_across_engines', {
        p_query_embedding: queryEmbedding,
        p_limit: limit,
      });

      if (error) {
        logger.error({ error }, 'Failed to search engines');
        return [];
      }

      logger.debug({ results: data?.length || 0 }, 'Engine search completed');

      return (data || []) as EngineSearchResult[];
    } catch (error) {
      logger.error({ error, query }, 'Failed to search engines');
      return [];
    }
  }
}

