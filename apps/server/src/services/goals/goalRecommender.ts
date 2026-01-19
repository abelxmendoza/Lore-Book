import { logger } from '../../logger';

import type { GoalInsight } from './types';

/**
 * Generates recommendations from goal insights
 */
export class GoalRecommender {
  /**
   * Convert insights to recommendations
   */
  recommend(insights: GoalInsight[]): Array<{
    title: string;
    urgency: 'low' | 'medium' | 'high';
    type: string;
    related_goal_id: string;
    message: string;
  }> {
    const recommendations: Array<{
      title: string;
      urgency: 'low' | 'medium' | 'high';
      type: string;
      related_goal_id: string;
      message: string;
    }> = [];

    for (const insight of insights) {
      const urgency = this.determineUrgency(insight);
      const title = this.generateTitle(insight);

      recommendations.push({
        title,
        urgency,
        type: 'goal',
        related_goal_id: insight.related_goal_id,
        message: insight.message,
      });
    }

    return recommendations;
  }

  /**
   * Determine urgency from insight
   */
  private determineUrgency(insight: GoalInsight): 'low' | 'medium' | 'high' {
    switch (insight.type) {
      case 'stagnation':
        return 'high';
      case 'dependency_warning':
        return 'medium';
      case 'goal_state_change':
        if (insight.message.includes('abandoned')) {
          return 'high';
        }
        return 'medium';
      case 'milestone':
        return 'low';
      case 'success_probability':
        return 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Generate recommendation title
   */
  private generateTitle(insight: GoalInsight): string {
    switch (insight.type) {
      case 'stagnation':
        return 'Goal Stagnation Detected';
      case 'dependency_warning':
        return 'Goal Dependency Warning';
      case 'goal_state_change':
        return 'Goal Status Changed';
      case 'milestone':
        return 'Milestone Achieved';
      case 'success_probability':
        return 'Goal Success Prediction';
      case 'progress':
        return 'Goal Progress Update';
      default:
        return 'Goal Insight';
    }
  }
}

