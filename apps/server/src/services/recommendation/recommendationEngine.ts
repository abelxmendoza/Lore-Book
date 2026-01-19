import { logger } from '../../logger';

import { deduplicateRecommendations } from './deduplication';
import { ActionGenerator } from './generators/actionGenerator';
import { PatternExplorationGenerator } from './generators/patternExplorationGenerator';
import { GapFillerGenerator } from './generators/gapFillerGenerator';
import { ContinuityFollowupGenerator } from './generators/continuityFollowupGenerator';
import { GoalReminderGenerator } from './generators/goalReminderGenerator';
import { GrowthOpportunityGenerator } from './generators/growthOpportunityGenerator';
import { JournalPromptGenerator } from './generators/journalPromptGenerator';
import { LegacyGenerator } from './generators/legacyGenerator';
import { ReflectionQuestionGenerator } from './generators/reflectionQuestionGenerator';
import { RelationshipCheckinGenerator } from './generators/relationshipCheckinGenerator';
import { PriorityScorer } from './prioritization/priorityScorer';
import { recommendationStorageService } from './storageService';
import type {
  Recommendation,
  RecommendationType,
  RecommendationStatus,
  RecommendationPayload,
} from './types';

/**
 * Main Recommendation Engine
 * Orchestrates all recommendation generators and provides unified API
 */
export class RecommendationEngine {
  private readonly CACHE_TTL_HOURS = 1; // Recommendations refresh more frequently than analytics
  private journalPromptGenerator: JournalPromptGenerator;
  private reflectionGenerator: ReflectionQuestionGenerator;
  private actionGenerator: ActionGenerator;
  private relationshipCheckinGenerator: RelationshipCheckinGenerator;
  private goalReminderGenerator: GoalReminderGenerator;
  private patternExplorationGenerator: PatternExplorationGenerator;
  private gapFillerGenerator: GapFillerGenerator;
  private continuityFollowupGenerator: ContinuityFollowupGenerator;
  private growthOpportunityGenerator: GrowthOpportunityGenerator;
  private legacyGenerator: LegacyGenerator;
  private priorityScorer: PriorityScorer;

  constructor() {
    this.journalPromptGenerator = new JournalPromptGenerator();
    this.reflectionGenerator = new ReflectionQuestionGenerator();
    this.actionGenerator = new ActionGenerator();
    this.relationshipCheckinGenerator = new RelationshipCheckinGenerator();
    this.goalReminderGenerator = new GoalReminderGenerator();
    this.patternExplorationGenerator = new PatternExplorationGenerator();
    this.gapFillerGenerator = new GapFillerGenerator();
    this.continuityFollowupGenerator = new ContinuityFollowupGenerator();
    this.growthOpportunityGenerator = new GrowthOpportunityGenerator();
    this.legacyGenerator = new LegacyGenerator();
    this.priorityScorer = new PriorityScorer();
  }

  /**
   * Generate recommendations for a user
   */
  async generateRecommendations(userId: string): Promise<Recommendation[]> {
    try {
      logger.debug({ userId }, 'Generating recommendations');

      const allRecommendations: Recommendation[] = [];

      // Generate recommendations from all generators
      const generators = [
        { name: 'journal_prompt', generator: this.journalPromptGenerator },
        { name: 'reflection_question', generator: this.reflectionGenerator },
        { name: 'action', generator: this.actionGenerator },
        { name: 'relationship_checkin', generator: this.relationshipCheckinGenerator },
        { name: 'goal_reminder', generator: this.goalReminderGenerator },
        { name: 'pattern_exploration', generator: this.patternExplorationGenerator },
        { name: 'gap_filler', generator: this.gapFillerGenerator },
        { name: 'continuity_followup', generator: this.continuityFollowupGenerator },
        { name: 'growth_opportunity', generator: this.growthOpportunityGenerator },
        { name: 'legacy_building', generator: this.legacyGenerator },
      ];

      for (const { name, generator } of generators) {
        try {
          const recommendations = await generator.generate(userId);
          allRecommendations.push(...recommendations);
          logger.debug(
            { userId, generator: name, count: recommendations.length },
            'Generated recommendations'
          );
        } catch (error) {
          logger.warn({ error, userId, generator: name }, 'Generator failed, continuing');
        }
      }

      // Deduplicate recommendations
      const deduplicated = deduplicateRecommendations(allRecommendations);

      // Score and prioritize
      const prioritized = await this.priorityScorer.scoreRecommendations(userId, deduplicated);

      // Sort by priority (descending)
      prioritized.sort((a, b) => b.priority - a.priority);

      logger.info(
        { userId, total: prioritized.length },
        'Generated and prioritized recommendations'
      );

      return prioritized;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate recommendations');
      return [];
    }
  }

  /**
   * Get active recommendations for a user
   */
  async getActiveRecommendations(
    userId: string,
    limit: number = 20
  ): Promise<RecommendationPayload> {
    try {
      const recommendations = await recommendationStorageService.getActiveRecommendations(
        userId,
        limit
      );

      // Group by type
      const by_type: Record<RecommendationType, number> = {
        journal_prompt: 0,
        reflection_question: 0,
        action: 0,
        relationship_checkin: 0,
        goal_reminder: 0,
        pattern_exploration: 0,
        gap_filler: 0,
        continuity_followup: 0,
        growth_opportunity: 0,
        legacy_building: 0,
      };

      recommendations.forEach(rec => {
        by_type[rec.type] = (by_type[rec.type] || 0) + 1;
      });

      // Get unique source engines
      const sources = new Set(
        recommendations.map(r => r.source_engine).filter((s): s is string => s !== undefined)
      );

      return {
        recommendations,
        total: recommendations.length,
        by_type,
        metadata: {
          generated_at: new Date().toISOString(),
          sources: Array.from(sources) as any[],
        },
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get active recommendations');
      return {
        recommendations: [],
        total: 0,
        by_type: {
          journal_prompt: 0,
          reflection_question: 0,
          action: 0,
          relationship_checkin: 0,
          goal_reminder: 0,
          pattern_exploration: 0,
          gap_filler: 0,
          continuity_followup: 0,
          growth_opportunity: 0,
          legacy_building: 0,
        },
      };
    }
  }

  /**
   * Mark recommendation as shown
   */
  async markAsShown(recommendationId: string): Promise<void> {
    await recommendationStorageService.updateStatus(recommendationId, 'shown');
  }

  /**
   * Mark recommendation as dismissed
   */
  async markAsDismissed(recommendationId: string): Promise<void> {
    await recommendationStorageService.updateStatus(recommendationId, 'dismissed');
  }

  /**
   * Mark recommendation as acted upon
   */
  async markAsActedUpon(recommendationId: string): Promise<void> {
    await recommendationStorageService.updateStatus(recommendationId, 'acted_upon');
  }
}

