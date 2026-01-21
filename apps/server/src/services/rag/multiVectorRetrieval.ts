import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { supabaseAdmin } from '../supabaseClient';

import type { MemoryEntry } from '../../types';

export interface MultiVectorEmbedding {
  id: string;
  titleEmbedding?: number[];
  contentEmbedding: number[];
  summaryEmbedding?: number[];
  entityEmbedding?: number[];
}

/**
 * Multi-Vector Retrieval Service
 * Generates and uses multiple embeddings per document for better retrieval
 */
export class MultiVectorRetrieval {
  /**
   * Generate multi-vector embeddings for a memory entry
   */
  async generateMultiEmbeddings(entry: MemoryEntry): Promise<MultiVectorEmbedding> {
    try {
      const embeddings: MultiVectorEmbedding = {
        id: entry.id || '',
        contentEmbedding: []
      };

      // Content embedding (always present)
      if (entry.content) {
        embeddings.contentEmbedding = await embeddingService.embedText(entry.content);
      }

      // Title/summary embedding
      const titleText = entry.summary || entry.title || '';
      if (titleText) {
        embeddings.summaryEmbedding = await embeddingService.embedText(titleText.slice(0, 500));
      }

      // Entity embedding (from tags, entities mentioned)
      const entityText = [
        ...(entry.tags || []),
        ...(entry.metadata?.entities || [])
      ].join(', ');
      
      if (entityText) {
        embeddings.entityEmbedding = await embeddingService.embedText(entityText.slice(0, 500));
      }

      return embeddings;
    } catch (error) {
      logger.error({ error, entryId: entry.id }, 'Failed to generate multi-embeddings');
      return {
        id: entry.id || '',
        contentEmbedding: []
      };
    }
  }

  /**
   * Search using multi-vector approach
   */
  async search(
    userId: string,
    query: string,
    limit: number = 20
  ): Promise<Array<MemoryEntry & { similarity: number; matchType: 'content' | 'summary' | 'entity' }>> {
    try {
      const queryEmbedding = await embeddingService.embedText(query);

      // Search across different embedding types
      const [contentResults, summaryResults, entityResults] = await Promise.all([
        this.searchByEmbedding(userId, queryEmbedding, 'content', limit * 2),
        this.searchByEmbedding(userId, queryEmbedding, 'summary', limit),
        this.searchByEmbedding(userId, queryEmbedding, 'entity', limit)
      ]);

      // Combine and deduplicate
      const resultMap = new Map<string, MemoryEntry & { similarity: number; matchType: 'content' | 'summary' | 'entity' }>();

      // Content matches (highest weight)
      contentResults.forEach(result => {
        if (!resultMap.has(result.id) || result.similarity > (resultMap.get(result.id)?.similarity || 0)) {
          resultMap.set(result.id, { ...result, matchType: 'content' });
        }
      });

      // Summary matches (medium weight)
      summaryResults.forEach(result => {
        const existing = resultMap.get(result.id);
        if (!existing || result.similarity * 0.9 > existing.similarity) {
          resultMap.set(result.id, { ...result, matchType: 'summary', similarity: result.similarity * 0.9 });
        }
      });

      // Entity matches (lower weight but still valuable)
      entityResults.forEach(result => {
        const existing = resultMap.get(result.id);
        if (!existing || result.similarity * 0.7 > existing.similarity) {
          resultMap.set(result.id, { ...result, matchType: 'entity', similarity: result.similarity * 0.7 });
        }
      });

      // Sort by similarity and return top results
      return Array.from(resultMap.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      logger.error({ error, query }, 'Multi-vector search failed');
      return [];
    }
  }

  /**
   * Search by specific embedding type
   */
  private async searchByEmbedding(
    userId: string,
    queryEmbedding: number[],
    type: 'content' | 'summary' | 'entity',
    limit: number
  ): Promise<Array<MemoryEntry & { similarity: number }>> {
    // For now, use content embedding (we'd need separate columns for other types)
    // In production, you'd have separate embedding columns: content_embedding, summary_embedding, entity_embedding
    const { data, error } = await supabaseAdmin.rpc('match_journal_entries', {
      user_uuid: userId,
      query_embedding: queryEmbedding,
      match_threshold: 0.6,
      match_count: limit
    });

    if (error) {
      logger.warn({ error, type }, 'Embedding search failed');
      return [];
    }

    return (data || []).map((entry: any) => ({
      ...entry,
      similarity: entry.similarity || 0
    }));
  }

  /**
   * Weighted combination of multiple embeddings
   */
  combineEmbeddings(embeddings: MultiVectorEmbedding, weights: {
    content: number;
    summary: number;
    entity: number;
  }): number[] {
    const dim = embeddings.contentEmbedding.length;
    const combined = new Array(dim).fill(0);
    let totalWeight = 0;

    if (embeddings.contentEmbedding.length > 0) {
      embeddings.contentEmbedding.forEach((val, i) => {
        combined[i] += val * weights.content;
      });
      totalWeight += weights.content;
    }

    if (embeddings.summaryEmbedding && embeddings.summaryEmbedding.length > 0) {
      embeddings.summaryEmbedding.forEach((val, i) => {
        combined[i] += val * weights.summary;
      });
      totalWeight += weights.summary;
    }

    if (embeddings.entityEmbedding && embeddings.entityEmbedding.length > 0) {
      embeddings.entityEmbedding.forEach((val, i) => {
        combined[i] += val * weights.entity;
      });
      totalWeight += weights.entity;
    }

    // Normalize
    if (totalWeight > 0) {
      return combined.map(val => val / totalWeight);
    }

    return combined;
  }
}

export const multiVectorRetrieval = new MultiVectorRetrieval();
