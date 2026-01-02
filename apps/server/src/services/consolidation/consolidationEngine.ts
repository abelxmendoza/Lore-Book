import { logger } from '../../logger';
import type {
  ConsolidationCandidate,
  ConsolidationPayload,
  ConsolidationStats,
  SimilarityType,
} from './types';
import { SimilarityDetector } from './similarityDetector';
import { ConsolidationStrategyService } from './consolidationStrategy';

/**
 * Main Memory Consolidation Engine
 * Detects and consolidates similar/duplicate memories
 */
export class MemoryConsolidationEngine {
  private detector: SimilarityDetector;
  private strategy: ConsolidationStrategyService;

  constructor() {
    this.detector = new SimilarityDetector();
    this.strategy = new ConsolidationStrategyService();
  }

  /**
   * Find consolidation candidates
   */
  async findCandidates(
    userId: string,
    entryIds?: string[]
  ): Promise<ConsolidationPayload> {
    try {
      logger.debug({ userId }, 'Finding consolidation candidates');

      // Detect similarities
      const similarities = await this.detector.detectSimilarities(userId, entryIds);

      if (similarities.length === 0) {
        return {
          candidates: [],
          total_candidates: 0,
          by_type: {
            exact: 0,
            near_duplicate: 0,
            similar_content: 0,
            temporal_proximity: 0,
            semantic: 0,
          },
        };
      }

      // Determine consolidation strategies
      const candidates = this.strategy.determineStrategy(similarities);

      // Group by similarity type
      const by_type: Record<SimilarityType, number> = {
        exact: 0,
        near_duplicate: 0,
        similar_content: 0,
        temporal_proximity: 0,
        semantic: 0,
      };

      similarities.forEach(s => {
        by_type[s.similarity_type]++;
      });

      logger.info(
        { userId, candidates: candidates.length },
        'Found consolidation candidates'
      );

      return {
        candidates,
        total_candidates: candidates.length,
        by_type,
        metadata: {
          analyzed_at: new Date().toISOString(),
          entries_analyzed: entryIds?.length || 500,
        },
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to find consolidation candidates');
      return {
        candidates: [],
        total_candidates: 0,
        by_type: {
          exact: 0,
          near_duplicate: 0,
          similar_content: 0,
          temporal_proximity: 0,
          semantic: 0,
        },
      };
    }
  }

  /**
   * Consolidate entries
   */
  async consolidate(
    userId: string,
    candidate: ConsolidationCandidate
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      logger.info({ userId, candidate }, 'Consolidating entries');

      const result = await this.strategy.executeConsolidation(userId, candidate);

      if (!result) {
        return {
          success: false,
          error: 'Failed to consolidate entries',
        };
      }

      logger.info(
        { userId, consolidatedId: result.consolidated_id },
        'Successfully consolidated entries'
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error({ error, userId, candidate }, 'Failed to consolidate entries');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get consolidation statistics
   */
  async getStats(userId: string): Promise<ConsolidationStats> {
    try {
      const payload = await this.findCandidates(userId);

      const exactDuplicates = payload.candidates.filter(
        c => c.similarity_scores.some(s => s.similarity_type === 'exact')
      ).length;

      const nearDuplicates = payload.candidates.filter(
        c => c.similarity_scores.some(s => s.similarity_type === 'near_duplicate')
      ).length;

      const similarContent = payload.candidates.filter(
        c => c.similarity_scores.some(s => s.similarity_type === 'similar_content' || s.similarity_type === 'semantic')
      ).length;

      // Count entries that could be consolidated
      const potentialSavings = payload.candidates
        .filter(c => c.strategy === 'merge' || c.strategy === 'link')
        .reduce((sum, c) => sum + c.entries.length - 1, 0);

      return {
        total_duplicates: payload.total_candidates,
        exact_duplicates: exactDuplicates,
        near_duplicates: nearDuplicates,
        similar_content: similarContent,
        consolidated_count: 0, // Would need to track this separately
        potential_savings: potentialSavings,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get consolidation stats');
      return {
        total_duplicates: 0,
        exact_duplicates: 0,
        near_duplicates: 0,
        similar_content: 0,
        consolidated_count: 0,
        potential_savings: 0,
      };
    }
  }
}

