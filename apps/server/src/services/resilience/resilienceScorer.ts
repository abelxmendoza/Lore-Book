import { logger } from '../../logger';
import type { Setback, ResilienceInsight } from './types';

/**
 * Calculates overall resilience score
 */
export class ResilienceScorer {
  /**
   * Calculate resilience score
   */
  score(setbacks: Setback[], insights: ResilienceInsight[]): ResilienceInsight {
    try {
      const emotional = insights.filter(i => i.type === 'emotional_recovery').length;
      const behavioral = insights.filter(i => i.type === 'behavioral_recovery').length;
      const growth = insights.filter(i => i.type === 'growth_from_adversity').length;
      const recoveries = insights.filter(i => i.type === 'recovery_started' || i.type === 'recovery_completed').length;

      // Calculate score components
      const totalSetbacks = setbacks.length;
      const totalRecoveryIndicators = emotional + behavioral + growth + recoveries;

      // Base score: ratio of recovery indicators to setbacks
      let score = 0.5; // Base score

      if (totalSetbacks > 0) {
        // More recovery indicators relative to setbacks = higher score
        const recoveryRatio = totalRecoveryIndicators / totalSetbacks;
        score = Math.min(1, 0.5 + recoveryRatio * 0.5);
      }

      // Bonus for growth
      if (growth > 0) {
        score = Math.min(1, score + growth * 0.1);
      }

      // Bonus for behavioral recovery (shows action)
      if (behavioral > 0) {
        score = Math.min(1, score + behavioral * 0.05);
      }

      // Penalty for high severity setbacks without recovery
      const highSeveritySetbacks = setbacks.filter(s => s.severity === 'high').length;
      const highSeverityRecoveries = insights.filter(
        i => i.related_setback_id && setbacks.find(s => s.id === i.related_setback_id && s.severity === 'high')
      ).length;

      if (highSeveritySetbacks > 0 && highSeverityRecoveries === 0) {
        score = Math.max(0, score - 0.1);
      }

      // Normalize to 0-1
      score = Math.max(0, Math.min(1, score));

      const percentage = Math.round(score * 100);

      return {
        id: crypto.randomUUID(),
        type: 'resilience_score',
        message: this.generateScoreMessage(percentage, totalSetbacks, totalRecoveryIndicators),
        confidence: 0.9,
        timestamp: new Date().toISOString(),
        metadata: {
          score,
          percentage,
          total_setbacks: totalSetbacks,
          emotional_recoveries: emotional,
          behavioral_recoveries: behavioral,
          growth_events: growth,
          total_recoveries: recoveries,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to calculate resilience score');
      return {
        id: crypto.randomUUID(),
        type: 'resilience_score',
        message: 'Unable to calculate resilience score at this time.',
        confidence: 0.5,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Generate score message
   */
  private generateScoreMessage(percentage: number, setbacks: number, recoveries: number): string {
    if (percentage >= 80) {
      return `Your resilience score is ${percentage}%. Excellent resilience - you consistently recover and grow from setbacks.`;
    }
    if (percentage >= 60) {
      return `Your resilience score is ${percentage}%. Good resilience - you show strong recovery patterns.`;
    }
    if (percentage >= 40) {
      return `Your resilience score is ${percentage}%. Moderate resilience - you recover from some setbacks.`;
    }
    if (percentage >= 20) {
      return `Your resilience score is ${percentage}%. Developing resilience - focus on recovery strategies.`;
    }
    return `Your resilience score is ${percentage}%. Building resilience - consider support and recovery strategies.`;
  }
}

