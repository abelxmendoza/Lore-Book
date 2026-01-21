// =====================================================
// SEMANTIC SIMILARITY SERVICE
// Purpose: Calculate semantic similarity between texts using embeddings
// Expected Impact: Better duplicate detection, more accurate events
// =====================================================

import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { embeddingCacheService } from '../embeddingCacheService';

export type SimilarityResult = {
  similarity: number; // 0-1, where 1 is identical
  threshold: number;
  isSimilar: boolean;
};

export type SimilarityThreshold = 'strict' | 'moderate' | 'loose';

/**
 * Calculates semantic similarity between texts
 */
export class SemanticSimilarityService {
  private readonly THRESHOLDS: Record<SimilarityThreshold, number> = {
    strict: 0.9, // Very similar
    moderate: 0.75, // Similar
    loose: 0.6, // Somewhat similar
  };

  /**
   * Calculate similarity between two texts
   */
  async calculateSimilarity(
    text1: string,
    text2: string,
    threshold: SimilarityThreshold = 'moderate'
  ): Promise<SimilarityResult> {
    try {
      // Get embeddings (will use cache)
      const [embedding1, embedding2] = await Promise.all([
        embeddingService.embedText(text1),
        embeddingService.embedText(text2),
      ]);

      const similarity = this.cosineSimilarity(embedding1, embedding2);
      const thresholdValue = this.THRESHOLDS[threshold];

      return {
        similarity,
        threshold: thresholdValue,
        isSimilar: similarity >= thresholdValue,
      };
    } catch (error) {
      logger.error({ error, text1, text2 }, 'Failed to calculate similarity');
      return {
        similarity: 0,
        threshold: this.THRESHOLDS[threshold],
        isSimilar: false,
      };
    }
  }

  /**
   * Calculate similarity between multiple texts (batch)
   */
  async calculateBatchSimilarity(
    texts: string[],
    threshold: SimilarityThreshold = 'moderate'
  ): Promise<Array<{ text1: string; text2: string; similarity: number; isSimilar: boolean }>> {
    if (texts.length < 2) return [];

    try {
      // Get all embeddings in parallel (will use cache)
      const embeddings = await Promise.all(
        texts.map(text => embeddingService.embedText(text))
      );

      const results: Array<{ text1: string; text2: string; similarity: number; isSimilar: boolean }> = [];
      const thresholdValue = this.THRESHOLDS[threshold];

      // Compare all pairs
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
          results.push({
            text1: texts[i],
            text2: texts[j],
            similarity,
            isSimilar: similarity >= thresholdValue,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, textCount: texts.length }, 'Failed to calculate batch similarity');
      return [];
    }
  }

  /**
   * Find similar texts from a collection
   */
  async findSimilar(
    targetText: string,
    candidateTexts: string[],
    threshold: SimilarityThreshold = 'moderate',
    limit: number = 10
  ): Promise<Array<{ text: string; similarity: number }>> {
    if (candidateTexts.length === 0) return [];

    try {
      // Get embeddings
      const [targetEmbedding, candidateEmbeddings] = await Promise.all([
        embeddingService.embedText(targetText),
        Promise.all(candidateTexts.map(text => embeddingService.embedText(text))),
      ]);

      const thresholdValue = this.THRESHOLDS[threshold];
      const similarities: Array<{ text: string; similarity: number }> = [];

      for (let i = 0; i < candidateTexts.length; i++) {
        const similarity = this.cosineSimilarity(targetEmbedding, candidateEmbeddings[i]);
        if (similarity >= thresholdValue) {
          similarities.push({
            text: candidateTexts[i],
            similarity,
          });
        }
      }

      // Sort by similarity (highest first) and limit
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      logger.error({ error, targetText, candidateCount: candidateTexts.length }, 'Failed to find similar texts');
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      logger.warn({ vecALength: vecA.length, vecBLength: vecB.length }, 'Vector length mismatch');
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Check if two texts are duplicates (high similarity)
   */
  async isDuplicate(
    text1: string,
    text2: string,
    threshold: SimilarityThreshold = 'strict'
  ): Promise<boolean> {
    const result = await this.calculateSimilarity(text1, text2, threshold);
    return result.isSimilar;
  }
}

export const semanticSimilarityService = new SemanticSimilarityService();
