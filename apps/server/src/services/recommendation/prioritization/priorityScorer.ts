import { logger } from '../../../logger';
import { recommendationStorageService } from '../storageService';
import type { Recommendation } from '../types';

/**
 * Scores and prioritizes recommendations
 */
export class PriorityScorer {
  /**
   * Score recommendations based on multiple factors
   */
  async scoreRecommendations(
    userId: string,
    recommendations: Recommendation[]
  ): Promise<Recommendation[]> {
    try {
      // Get user's recommendation history to learn preferences
      const history = await recommendationStorageService.getRecommendationHistory(userId, 100);
      const actionRate = this.calculateActionRate(history);

      // Score each recommendation
      const scored = recommendations.map(rec => {
        const score = this.calculatePriorityScore(rec, actionRate);
        return {
          ...rec,
          priority: Math.max(1, Math.min(10, Math.round(score))),
        };
      });

      return scored;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to score recommendations, using defaults');
      return recommendations;
    }
  }

  /**
   * Calculate priority score for a recommendation
   */
  private calculatePriorityScore(
    rec: Recommendation,
    userActionRate: number
  ): number {
    let score = rec.priority; // Start with base priority

    // Factor 1: Confidence (0-3 points)
    score += rec.confidence * 3;

    // Factor 2: Urgency based on type (0-2 points)
    const urgencyBoost = this.getUrgencyBoost(rec.type);
    score += urgencyBoost;

    // Factor 3: User engagement history (0-2 points)
    // If user has high action rate, boost recommendations they typically act on
    if (userActionRate > 0.5) {
      score += 1;
    }

    // Factor 4: Source engine reliability (0-1 point)
    const sourceReliability = this.getSourceReliability(rec.source_engine);
    score += sourceReliability;

    // Factor 5: Recency (0-1 point)
    // Newer patterns are more relevant
    if (rec.context?.timeframe && rec.context.timeframe.includes('recent')) {
      score += 0.5;
    }

    return score;
  }

  /**
   * Get urgency boost based on recommendation type
   */
  private getUrgencyBoost(type: Recommendation['type']): number {
    const urgencyMap: Record<Recommendation['type'], number> = {
      continuity_followup: 2.0, // High urgency - contradictions need attention
      action: 1.5, // Medium-high - actionable items
      goal_reminder: 1.5, // Medium-high - goals at risk
      relationship_checkin: 1.0, // Medium - relationships need maintenance
      gap_filler: 0.5, // Low-medium - gaps can wait
      reflection_question: 1.0, // Medium - reflection is important
      journal_prompt: 0.5, // Low-medium - prompts are helpful but not urgent
      pattern_exploration: 0.5, // Low-medium - exploration can wait
      growth_opportunity: 1.0, // Medium - growth is important
      legacy_building: 0.3, // Low - legacy is long-term
    };

    return urgencyMap[type] || 0.5;
  }

  /**
   * Get source engine reliability score
   */
  private getSourceReliability(source?: string): number {
    const reliabilityMap: Record<string, number> = {
      continuity: 1.0, // High reliability
      chronology: 0.8, // High reliability
      identity_pulse: 0.7, // Medium-high
      relationship_analytics: 0.7, // Medium-high
      insight_engine: 0.6, // Medium
      prediction_engine: 0.5, // Medium (predictions are uncertain)
      shadow_engine: 0.6, // Medium
      essence_profile: 0.7, // Medium-high
      task_engine: 0.8, // High (tasks are concrete)
      autopilot: 0.7, // Medium-high
    };

    return source ? reliabilityMap[source] || 0.5 : 0.5;
  }

  /**
   * Calculate user's action rate from history
   */
  private calculateActionRate(history: Recommendation[]): number {
    if (history.length === 0) return 0.5; // Default assumption

    const shown = history.filter(r => r.status === 'shown' || r.status === 'acted_upon').length;
    const actedUpon = history.filter(r => r.status === 'acted_upon').length;

    if (shown === 0) return 0.5;

    return actedUpon / shown;
  }
}

