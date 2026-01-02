import { logger } from '../../logger';
import type {
  WisdomStatement,
  WisdomPayload,
  WisdomStats,
  WisdomCategory,
} from './types';
import { WisdomExtractor } from './wisdomExtractor';
import { wisdomStorageService } from './wisdomStorage';
import { WisdomTracker } from './wisdomTracker';
import { WisdomConnector } from './wisdomConnector';

/**
 * Main Wisdom Engine
 * Orchestrates wisdom extraction, tracking, and connection
 */
export class WisdomEngine {
  private extractor: WisdomExtractor;
  private tracker: WisdomTracker;
  private connector: WisdomConnector;

  constructor() {
    this.extractor = new WisdomExtractor();
    this.tracker = new WisdomTracker();
    this.connector = new WisdomConnector();
  }

  /**
   * Extract wisdom from a journal entry
   */
  async extractFromEntry(
    userId: string,
    entryId: string,
    content: string,
    entryDate: string
  ): Promise<WisdomStatement[]> {
    try {
      logger.debug({ userId, entryId }, 'Extracting wisdom from entry');

      // Extract wisdom
      const wisdom = await this.extractor.extractWisdom(
        content,
        'journal_entry',
        entryId,
        entryDate
      );

      if (wisdom.length === 0) {
        return [];
      }

      // Save wisdom
      const saved = await wisdomStorageService.saveWisdomStatements(userId, wisdom);

      // Track patterns
      await this.tracker.trackPatterns(userId, saved);

      // Connect to related experiences and patterns
      await this.connector.connectWisdom(userId, saved);

      logger.info(
        { userId, entryId, count: saved.length },
        'Extracted and saved wisdom'
      );

      return saved;
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to extract wisdom from entry');
      return [];
    }
  }

  /**
   * Get wisdom for user
   */
  async getWisdom(
    userId: string,
    options?: {
      category?: WisdomCategory;
      limit?: number;
      orderBy?: 'date' | 'recurrence' | 'confidence';
    }
  ): Promise<WisdomPayload> {
    try {
      const wisdom = await wisdomStorageService.getWisdomStatements(userId, options);
      const patterns = await wisdomStorageService.getWisdomPatterns(userId);

      // Group by category
      const by_category: Record<WisdomCategory, number> = {
        life_lesson: 0,
        insight: 0,
        realization: 0,
        principle: 0,
        philosophy: 0,
        advice: 0,
        observation: 0,
        truth: 0,
      };

      wisdom.forEach(w => {
        by_category[w.category] = (by_category[w.category] || 0) + 1;
      });

      // Get unique sources
      const sources = new Set(wisdom.map(w => w.source));

      return {
        wisdom,
        patterns,
        total: wisdom.length,
        by_category,
        metadata: {
          extracted_at: new Date().toISOString(),
          sources: Array.from(sources) as any[],
        },
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get wisdom');
      return {
        wisdom: [],
        patterns: [],
        total: 0,
        by_category: {
          life_lesson: 0,
          insight: 0,
          realization: 0,
          principle: 0,
          philosophy: 0,
          advice: 0,
          observation: 0,
          truth: 0,
        },
      };
    }
  }

  /**
   * Get wisdom statistics
   */
  async getStats(userId: string): Promise<WisdomStats> {
    try {
      const wisdom = await wisdomStorageService.getWisdomStatements(userId);
      const patterns = await wisdomStorageService.getWisdomPatterns(userId);

      // Group by category
      const by_category: Record<WisdomCategory, number> = {
        life_lesson: 0,
        insight: 0,
        realization: 0,
        principle: 0,
        philosophy: 0,
        advice: 0,
        observation: 0,
        truth: 0,
      };

      let confidenceSum = 0;
      wisdom.forEach(w => {
        by_category[w.category]++;
        confidenceSum += w.confidence;
      });

      // Get most recurring patterns
      const mostRecurring = patterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5);

      // Get recent wisdom
      const recentWisdom = wisdom
        .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime())
        .slice(0, 10);

      return {
        total: wisdom.length,
        by_category,
        recurring_themes: patterns.length,
        avg_confidence: wisdom.length > 0 ? confidenceSum / wisdom.length : 0,
        most_recurring: mostRecurring,
        recent_wisdom: recentWisdom,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get wisdom stats');
      return {
        total: 0,
        by_category: {
          life_lesson: 0,
          insight: 0,
          realization: 0,
          principle: 0,
          philosophy: 0,
          advice: 0,
          observation: 0,
          truth: 0,
        },
        recurring_themes: 0,
        avg_confidence: 0,
        most_recurring: [],
        recent_wisdom: [],
      };
    }
  }
}

