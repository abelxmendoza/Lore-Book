import { logger } from '../../logger';

import { ContextAggregator } from './contextAggregator';
import type { FullContext, ContextQuery, ContextScope } from './types';

/**
 * Main Context Engine
 * Provides rich contextual information for any moment in time
 */
export class ContextEngine {
  private aggregator: ContextAggregator;

  constructor() {
    this.aggregator = new ContextAggregator();
  }

  /**
   * Get full context for a moment
   */
  async getContext(query: ContextQuery): Promise<FullContext> {
    try {
      const userId = query.userId;
      const centerDate = query.date || new Date().toISOString();
      const scope: ContextScope = query.scope || 'week';
      const include = query.include || [
        'temporal',
        'emotional',
        'relationships',
        'learning',
        'wisdom',
        'patterns',
        'goals',
        'recommendations',
      ];
      const exclude = query.exclude || [];

      logger.debug({ userId, centerDate, scope }, 'Getting context');

      // Aggregate context from all engines
      const temporal = include.includes('temporal') && !exclude.includes('temporal')
        ? await this.aggregator.getTemporalContext(userId, centerDate, scope)
        : {
            date: centerDate,
            scope,
            before: [],
            during: [],
            after: [],
            gaps: [],
          };

      const emotional = include.includes('emotional') && !exclude.includes('emotional')
        ? await this.aggregator.getEmotionalContext(userId, centerDate, scope)
        : {
            mood: null,
            sentiment: 0,
            emotional_trajectory: 'stable' as const,
            recent_emotions: [],
          };

      const relationships = include.includes('relationships') && !exclude.includes('relationships')
        ? await this.aggregator.getRelationshipContext(userId, centerDate)
        : {
            active_relationships: [],
            relationship_changes: [],
          };

      const learning = include.includes('learning') && !exclude.includes('learning')
        ? await this.aggregator.getLearningContext(userId, centerDate)
        : {
            skills_learned: [],
            learning_velocity: 0,
            active_learning_areas: [],
          };

      const wisdom = include.includes('wisdom') && !exclude.includes('wisdom')
        ? await this.aggregator.getWisdomContext(userId, centerDate)
        : {
            relevant_wisdom: [],
            recurring_themes: [],
          };

      const patterns = include.includes('patterns') && !exclude.includes('patterns')
        ? await this.aggregator.getPatternContext(userId, centerDate)
        : {
            behavioral_patterns: [],
            continuity_events: [],
          };

      const goals = include.includes('goals') && !exclude.includes('goals')
        ? await this.aggregator.getGoalContext(userId, centerDate)
        : {
            active_goals: [],
            goal_progress: [],
          };

      const recommendations = include.includes('recommendations') && !exclude.includes('recommendations')
        ? await this.aggregator.getRecommendationContext(userId)
        : {
            recommendations: [],
          };

      const sources = include.filter(i => !exclude.includes(i));

      return {
        temporal,
        emotional,
        relationships,
        learning,
        wisdom,
        patterns,
        goals,
        recommendations,
        metadata: {
          generated_at: new Date().toISOString(),
          scope,
          center_date: centerDate,
          sources,
        },
      };
    } catch (error) {
      logger.error({ error, query }, 'Failed to get context');
      throw error;
    }
  }
}

