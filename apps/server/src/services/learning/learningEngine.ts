import { logger } from '../../logger';
import type {
  LearningRecord,
  LearningPayload,
  LearningStats,
  LearningType,
  ProficiencyLevel,
} from './types';
import { LearningExtractor } from './learningExtractor';
import { learningStorageService } from './learningStorage';
import { LearningTracker } from './learningTracker';
import { LearningAnalyzer } from './learningAnalyzer';

/**
 * Main Learning Engine
 * Orchestrates learning extraction, tracking, and analysis
 */
export class LearningEngine {
  private extractor: LearningExtractor;
  private tracker: LearningTracker;
  private analyzer: LearningAnalyzer;

  constructor() {
    this.extractor = new LearningExtractor();
    this.tracker = new LearningTracker();
    this.analyzer = new LearningAnalyzer();
  }

  /**
   * Extract learning from a journal entry
   */
  async extractFromEntry(
    userId: string,
    entryId: string,
    content: string,
    entryDate: string
  ): Promise<LearningRecord[]> {
    try {
      logger.debug({ userId, entryId }, 'Extracting learning from entry');

      // Extract learning
      const learning = await this.extractor.extractLearning(
        content,
        'journal_entry',
        entryId,
        entryDate
      );

      if (learning.length === 0) {
        return [];
      }

      // Save learning
      const saved = await learningStorageService.saveLearningRecords(userId, learning);

      // Track patterns
      await this.tracker.trackPatterns(userId, saved);

      logger.info(
        { userId, entryId, count: saved.length },
        'Extracted and saved learning'
      );

      return saved;
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to extract learning from entry');
      return [];
    }
  }

  /**
   * Get learning for user
   */
  async getLearning(
    userId: string,
    options?: {
      type?: LearningType;
      proficiency?: ProficiencyLevel;
      limit?: number;
      orderBy?: 'date' | 'practice' | 'proficiency';
    }
  ): Promise<LearningPayload> {
    try {
      const learning = await learningStorageService.getLearningRecords(userId, options);
      const patterns = await learningStorageService.getLearningPatterns(userId);
      const gaps = await this.analyzer.identifyGaps(learning);

      // Group by type
      const by_type: Record<LearningType, number> = {
        skill: 0,
        knowledge: 0,
        concept: 0,
        technique: 0,
        tool: 0,
        language: 0,
        framework: 0,
        methodology: 0,
      };

      learning.forEach(l => {
        by_type[l.type] = (by_type[l.type] || 0) + 1;
      });

      // Group by proficiency
      const by_proficiency: Record<ProficiencyLevel, number> = {
        beginner: 0,
        intermediate: 0,
        advanced: 0,
        expert: 0,
      };

      learning.forEach(l => {
        by_proficiency[l.proficiency] = (by_proficiency[l.proficiency] || 0) + 1;
      });

      // Get unique sources
      const sources = new Set(learning.map(l => l.source));

      return {
        learning,
        patterns,
        gaps,
        total: learning.length,
        by_type,
        by_proficiency,
        metadata: {
          extracted_at: new Date().toISOString(),
          sources: Array.from(sources) as any[],
        },
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get learning');
      return {
        learning: [],
        patterns: [],
        gaps: [],
        total: 0,
        by_type: {
          skill: 0,
          knowledge: 0,
          concept: 0,
          technique: 0,
          tool: 0,
          language: 0,
          framework: 0,
          methodology: 0,
        },
        by_proficiency: {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        },
      };
    }
  }

  /**
   * Get learning statistics
   */
  async getStats(userId: string): Promise<LearningStats> {
    try {
      const learning = await learningStorageService.getLearningRecords(userId);
      const patterns = await learningStorageService.getLearningPatterns(userId);

      // Group by type
      const by_type: Record<LearningType, number> = {
        skill: 0,
        knowledge: 0,
        concept: 0,
        technique: 0,
        tool: 0,
        language: 0,
        framework: 0,
        methodology: 0,
      };

      // Group by proficiency
      const by_proficiency: Record<ProficiencyLevel, number> = {
        beginner: 0,
        intermediate: 0,
        advanced: 0,
        expert: 0,
      };

      learning.forEach(l => {
        by_type[l.type]++;
        by_proficiency[l.proficiency]++;
      });

      // Calculate learning velocity (skills per month)
      const patternsWithGrowth = patterns.filter(p => p.growth_rate > 0);
      const avgGrowthRate = patternsWithGrowth.length > 0
        ? patternsWithGrowth.reduce((sum, p) => sum + p.growth_rate, 0) / patternsWithGrowth.length
        : 0;

      // Get strongest areas (themes with highest avg proficiency)
      const strongestAreas = patterns
        .sort((a, b) => b.avg_proficiency - a.avg_proficiency)
        .slice(0, 5)
        .map(p => p.theme);

      // Get growth areas (themes with highest growth rate)
      const growthAreas = patterns
        .sort((a, b) => b.growth_rate - a.growth_rate)
        .slice(0, 5)
        .map(p => p.theme);

      // Get recent learning
      const recentLearning = learning
        .sort((a, b) => new Date(b.source_date).getTime() - new Date(a.source_date).getTime())
        .slice(0, 10);

      return {
        total_skills: learning.length,
        by_type,
        by_proficiency,
        learning_velocity: avgGrowthRate,
        strongest_areas: strongestAreas,
        growth_areas: growthAreas,
        recent_learning: recentLearning,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get learning stats');
      return {
        total_skills: 0,
        by_type: {
          skill: 0,
          knowledge: 0,
          concept: 0,
          technique: 0,
          tool: 0,
          language: 0,
          framework: 0,
          methodology: 0,
        },
        by_proficiency: {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        },
        learning_velocity: 0,
        strongest_areas: [],
        growth_areas: [],
        recent_learning: [],
      };
    }
  }
}

