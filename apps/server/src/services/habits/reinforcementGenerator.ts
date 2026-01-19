import { logger } from '../../logger';

import type { HabitInsight } from './types';

/**
 * Generates reinforcement recommendations from habit insights
 */
export class ReinforcementGenerator {
  /**
   * Generate reinforcement recommendations
   */
  generate(insights: HabitInsight[]): Array<{
    title: string;
    type: string;
    urgency: 'low' | 'medium' | 'high';
    habit_id: string;
    message: string;
  }> {
    const recommendations: Array<{
      title: string;
      type: string;
      urgency: 'low' | 'medium' | 'high';
      habit_id: string;
      message: string;
    }> = [];

    for (const insight of insights) {
      const urgency = this.determineUrgency(insight);
      const title = this.generateTitle(insight);

      recommendations.push({
        title,
        type: 'habit_reinforcement',
        urgency,
        habit_id: insight.habit_id,
        message: insight.message,
      });
    }

    return recommendations;
  }

  /**
   * Determine urgency from insight
   */
  private determineUrgency(insight: HabitInsight): 'low' | 'medium' | 'high' {
    switch (insight.type) {
      case 'decay_warning':
        const risk = insight.metadata?.decay_risk || 0;
        if (risk >= 0.7) return 'high';
        if (risk >= 0.5) return 'medium';
        return 'medium';
      case 'streak_update':
        const streak = insight.metadata?.streak || 0;
        if (streak === 0 && insight.metadata?.previous_streak > 7) {
          return 'high'; // Broken long streak
        }
        if (streak >= 30) return 'low'; // Long streak = low urgency
        return 'medium';
      case 'habit_loop':
        return 'low';
      case 'cluster_assignment':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Generate recommendation title
   */
  private generateTitle(insight: HabitInsight): string {
    switch (insight.type) {
      case 'decay_warning':
        return 'Habit Decay Warning';
      case 'streak_update':
        const streak = insight.metadata?.streak || 0;
        if (streak === 0) {
          return 'Streak Broken';
        }
        return `Streak Milestone: ${streak} Days`;
      case 'habit_loop':
        return 'Habit Loop Detected';
      case 'cluster_assignment':
        return 'Habit Clustered';
      case 'habit_detected':
        return 'New Habit Detected';
      case 'consistency_prediction':
        return 'Consistency Prediction';
      default:
        return 'Habit Insight';
    }
  }
}


