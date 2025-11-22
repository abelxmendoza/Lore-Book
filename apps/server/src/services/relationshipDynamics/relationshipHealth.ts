import { logger } from '../../logger';
import type {
  RelationshipMetrics,
  RelationshipHealthScore,
  RelationshipHealth,
} from './types';

/**
 * Tracks and calculates relationship health
 */
export class RelationshipHealthTracker {
  /**
   * Calculate health score from metrics
   */
  calculateHealth(metrics: RelationshipMetrics): RelationshipHealthScore {
    // Calculate individual factor scores (0-100)
    const sentimentScore = this.scoreSentiment(metrics.average_sentiment);
    const frequencyScore = this.scoreFrequency(metrics.interaction_frequency);
    const consistencyScore = metrics.interaction_consistency * 100;
    const conflictScore = this.scoreConflict(metrics.conflict_frequency);
    const supportScore = this.scoreSupport(metrics.support_frequency);

    // Weighted overall health score
    const healthScore =
      sentimentScore * 0.3 +
      frequencyScore * 0.2 +
      consistencyScore * 0.2 +
      conflictScore * 0.15 +
      supportScore * 0.15;

    // Determine overall health
    const overallHealth = this.mapScoreToHealth(healthScore);

    // Determine trends
    const healthTrend = this.determineHealthTrend(metrics);
    const sentimentTrend = metrics.sentiment_trend;
    const frequencyTrend = this.determineFrequencyTrend(metrics);

    // Identify concerns and strengths
    const concerns = this.identifyConcerns(metrics, healthScore);
    const strengths = this.identifyStrengths(metrics, healthScore);

    return {
      overall_health: overallHealth,
      health_score: Math.round(healthScore),
      factors: {
        sentiment: sentimentScore,
        frequency: frequencyScore,
        consistency: consistencyScore,
        conflict_level: conflictScore,
        support_level: supportScore,
      },
      trends: {
        health_trend: healthTrend,
        sentiment_trend: sentimentTrend,
        frequency_trend: frequencyTrend,
      },
      concerns: concerns.length > 0 ? concerns : undefined,
      strengths: strengths.length > 0 ? strengths : undefined,
    };
  }

  /**
   * Score sentiment (0-100)
   */
  private scoreSentiment(sentiment: number): number {
    // Map -1 to 1 sentiment to 0-100 score
    return Math.max(0, Math.min(100, (sentiment + 1) * 50));
  }

  /**
   * Score frequency (0-100)
   */
  private scoreFrequency(frequency: number): number {
    // Optimal: 4-8 interactions per month
    if (frequency >= 4 && frequency <= 8) return 100;
    if (frequency >= 2 && frequency < 4) return 80;
    if (frequency > 8 && frequency <= 12) return 90;
    if (frequency > 12) return 70; // Too frequent might indicate dependency
    if (frequency >= 1 && frequency < 2) return 60;
    if (frequency >= 0.5 && frequency < 1) return 40;
    return 20; // Very infrequent
  }

  /**
   * Score conflict (0-100, higher conflict = lower score)
   */
  private scoreConflict(conflictFrequency: number): number {
    // 0 conflicts = 100, 1+ per month = lower score
    if (conflictFrequency === 0) return 100;
    if (conflictFrequency <= 0.5) return 80;
    if (conflictFrequency <= 1) return 60;
    if (conflictFrequency <= 2) return 40;
    return 20; // High conflict
  }

  /**
   * Score support (0-100, higher support = higher score)
   */
  private scoreSupport(supportFrequency: number): number {
    // More support = better
    if (supportFrequency >= 2) return 100;
    if (supportFrequency >= 1) return 80;
    if (supportFrequency >= 0.5) return 60;
    if (supportFrequency > 0) return 40;
    return 20; // No support interactions
  }

  /**
   * Map score to health level
   */
  private mapScoreToHealth(score: number): RelationshipHealth {
    if (score >= 80) return 'excellent';
    if (score >= 65) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 35) return 'poor';
    return 'critical';
  }

  /**
   * Determine health trend
   */
  private determineHealthTrend(
    metrics: RelationshipMetrics
  ): 'improving' | 'declining' | 'stable' {
    // Use sentiment trend as primary indicator
    if (metrics.sentiment_trend === 'improving') return 'improving';
    if (metrics.sentiment_trend === 'declining') return 'declining';

    // Check frequency trend
    if (metrics.interaction_frequency > 0 && metrics.last_interaction_days_ago < 30) {
      return 'stable';
    }

    return 'stable';
  }

  /**
   * Determine frequency trend
   */
  private determineFrequencyTrend(
    metrics: RelationshipMetrics
  ): 'increasing' | 'decreasing' | 'stable' {
    // If last interaction was recent and frequency is good, stable
    if (metrics.last_interaction_days_ago < 30 && metrics.interaction_frequency >= 1) {
      return 'stable';
    }

    // If last interaction was long ago, decreasing
    if (metrics.last_interaction_days_ago > 60) {
      return 'decreasing';
    }

    return 'stable';
  }

  /**
   * Identify concerns
   */
  private identifyConcerns(metrics: RelationshipMetrics, healthScore: number): string[] {
    const concerns: string[] = [];

    if (metrics.average_sentiment < -0.3) {
      concerns.push('Negative sentiment trend');
    }

    if (metrics.conflict_frequency > 1) {
      concerns.push('High conflict frequency');
    }

    if (metrics.last_interaction_days_ago > 90) {
      concerns.push('No recent interactions');
    }

    if (metrics.interaction_frequency < 0.5) {
      concerns.push('Very low interaction frequency');
    }

    if (metrics.positive_ratio < 0.3) {
      concerns.push('Low positive interaction ratio');
    }

    if (healthScore < 40) {
      concerns.push('Overall relationship health is low');
    }

    return concerns;
  }

  /**
   * Identify strengths
   */
  private identifyStrengths(metrics: RelationshipMetrics, healthScore: number): string[] {
    const strengths: string[] = [];

    if (metrics.average_sentiment > 0.3) {
      strengths.push('Positive sentiment');
    }

    if (metrics.support_frequency > 1) {
      strengths.push('High support frequency');
    }

    if (metrics.interaction_frequency >= 2 && metrics.interaction_frequency <= 8) {
      strengths.push('Healthy interaction frequency');
    }

    if (metrics.interaction_consistency > 0.7) {
      strengths.push('Consistent interactions');
    }

    if (metrics.positive_ratio > 0.7) {
      strengths.push('High positive interaction ratio');
    }

    if (healthScore >= 70) {
      strengths.push('Strong overall relationship health');
    }

    return strengths;
  }
}

