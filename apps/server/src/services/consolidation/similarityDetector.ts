import { differenceInHours, parseISO } from 'date-fns';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { SimilarityScore, SimilarityType } from './types';

/**
 * Detects similar and duplicate memories
 */
export class SimilarityDetector {
  private readonly SIMILARITY_THRESHOLD = 0.85; // For near duplicates
  private readonly SEMANTIC_THRESHOLD = 0.75; // For semantic similarity
  private readonly TEMPORAL_PROXIMITY_HOURS = 24; // Entries within 24 hours

  /**
   * Detect similarities between entries
   */
  async detectSimilarities(
    userId: string,
    entryIds?: string[]
  ): Promise<SimilarityScore[]> {
    const similarities: SimilarityScore[] = [];

    try {
      // Get entries to analyze
      let query = supabaseAdmin
        .from('journal_entries')
        .select('id, content, date, embedding, tags, people')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(entryIds ? entryIds.length : 500);

      if (entryIds && entryIds.length > 0) {
        query = query.in('id', entryIds);
      }

      const { data: entries, error } = await query;

      if (error || !entries || entries.length < 2) {
        return similarities;
      }

      // Compare all pairs
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const entry1 = entries[i];
          const entry2 = entries[j];

          // Check for exact duplicates
          const exactScore = this.checkExactDuplicate(entry1, entry2);
          if (exactScore) {
            similarities.push(exactScore);
            continue;
          }

          // Check for near duplicates
          const nearDuplicateScore = this.checkNearDuplicate(entry1, entry2);
          if (nearDuplicateScore) {
            similarities.push(nearDuplicateScore);
            continue;
          }

          // Check for similar content (using embeddings if available)
          const semanticScore = await this.checkSemanticSimilarity(entry1, entry2);
          if (semanticScore) {
            similarities.push(semanticScore);
            continue;
          }

          // Check for temporal proximity
          const temporalScore = this.checkTemporalProximity(entry1, entry2);
          if (temporalScore) {
            similarities.push(temporalScore);
          }
        }
      }

      logger.debug(
        { userId, similarities: similarities.length },
        'Detected similarities'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect similarities');
    }

    return similarities;
  }

  /**
   * Check for exact duplicates
   */
  private checkExactDuplicate(
    entry1: any,
    entry2: any
  ): SimilarityScore | null {
    const content1 = entry1.content.trim().toLowerCase();
    const content2 = entry2.content.trim().toLowerCase();

    if (content1 === content2 && content1.length > 10) {
      return {
        entry1_id: entry1.id,
        entry2_id: entry2.id,
        similarity_type: 'exact',
        score: 1.0,
        confidence: 1.0,
        reasons: ['Exact content match'],
        metadata: {
          content_length: content1.length,
        },
      };
    }

    return null;
  }

  /**
   * Check for near duplicates (very similar content)
   */
  private checkNearDuplicate(
    entry1: any,
    entry2: any
  ): SimilarityScore | null {
    const content1 = entry1.content.trim().toLowerCase();
    const content2 = entry2.content.trim().toLowerCase();

    // Simple word overlap similarity
    const words1 = new Set(content1.split(/\s+/));
    const words2 = new Set(content2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;

    if (similarity >= this.SIMILARITY_THRESHOLD && content1.length > 20) {
      return {
        entry1_id: entry1.id,
        entry2_id: entry2.id,
        similarity_type: 'near_duplicate',
        score: similarity,
        confidence: 0.9,
        reasons: [`High word overlap: ${(similarity * 100).toFixed(0)}%`],
        metadata: {
          word_overlap: intersection.size,
          total_words: union.size,
        },
      };
    }

    return null;
  }

  /**
   * Check for semantic similarity using embeddings
   */
  private async checkSemanticSimilarity(
    entry1: any,
    entry2: any
  ): Promise<SimilarityScore | null> {
    // Check if embeddings exist
    if (!entry1.embedding || !entry2.embedding) {
      return null;
    }

    const embedding1 = entry1.embedding as number[];
    const embedding2 = entry2.embedding as number[];

    if (embedding1.length !== embedding2.length) {
      return null;
    }

    // Calculate cosine similarity
    const similarity = this.cosineSimilarity(embedding1, embedding2);

    if (similarity >= this.SEMANTIC_THRESHOLD) {
      return {
        entry1_id: entry1.id,
        entry2_id: entry2.id,
        similarity_type: 'semantic',
        score: similarity,
        confidence: 0.8,
        reasons: [`Semantic similarity: ${(similarity * 100).toFixed(0)}%`],
        metadata: {
          embedding_dimension: embedding1.length,
        },
      };
    }

    return null;
  }

  /**
   * Check for temporal proximity
   */
  private checkTemporalProximity(
    entry1: any,
    entry2: any
  ): SimilarityScore | null {
    try {
      const date1 = parseISO(entry1.date);
      const date2 = parseISO(entry2.date);
      const hoursDiff = Math.abs(differenceInHours(date1, date2));

      if (hoursDiff <= this.TEMPORAL_PROXIMITY_HOURS) {
        // Check if content is somewhat similar (at least 30% overlap)
        const content1 = entry1.content.trim().toLowerCase();
        const content2 = entry2.content.trim().toLowerCase();
        
        const words1 = new Set(content1.split(/\s+/));
        const words2 = new Set(content2.split(/\s+/));
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        const contentSimilarity = intersection.size / union.size;

        if (contentSimilarity >= 0.3) {
          return {
            entry1_id: entry1.id,
            entry2_id: entry2.id,
            similarity_type: 'temporal_proximity',
            score: contentSimilarity,
            confidence: 0.6,
            reasons: [
              `Temporal proximity: ${hoursDiff} hours apart`,
              `Content similarity: ${(contentSimilarity * 100).toFixed(0)}%`,
            ],
            metadata: {
              hours_apart: hoursDiff,
              content_similarity: contentSimilarity,
            },
          };
        }
      }
    } catch (error) {
      // Invalid dates, skip
    }

    return null;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

