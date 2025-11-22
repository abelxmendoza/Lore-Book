import { logger } from '../../logger';
import { addDays, format, parseISO } from 'date-fns';
import type { Prediction, PatternAnalysis, PredictionConfidence } from './types';

/**
 * Generates predictions based on patterns
 */
export class ForecastGenerator {
  /**
   * Generate predictions from patterns
   */
  generatePredictions(
    patterns: PatternAnalysis[],
    userId: string,
    horizonDays: number = 30
  ): Prediction[] {
    const predictions: Prediction[] = [];

    try {
      for (const pattern of patterns) {
        const patternPredictions = this.generateFromPattern(pattern, userId, horizonDays);
        predictions.push(...patternPredictions);
      }

      logger.debug(
        { userId, predictions: predictions.length },
        'Generated predictions from patterns'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate predictions');
    }

    return predictions;
  }

  /**
   * Generate predictions from a single pattern
   */
  private generateFromPattern(
    pattern: PatternAnalysis,
    userId: string,
    horizonDays: number
  ): Prediction[] {
    const predictions: Prediction[] = [];

    // Only predict if pattern has periodicity
    if (!pattern.periodicity || pattern.periodicity > horizonDays) {
      return predictions;
    }

    const now = new Date();
    const lastExample = pattern.examples[pattern.examples.length - 1];

    // Calculate next occurrence
    const nextOccurrence = addDays(now, pattern.periodicity);
    const daysUntil = Math.ceil((nextOccurrence.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil > horizonDays) {
      return predictions;
    }

    // Determine confidence based on pattern strength
    const confidence = this.mapStrengthToConfidence(pattern.strength);
    const confidenceScore = pattern.strength;

    // Generate prediction based on pattern type
    switch (pattern.pattern_type) {
      case 'mood_recurrence':
        predictions.push({
          user_id: userId,
          type: 'mood',
          title: `Likely mood: ${pattern.metadata.mood}`,
          description: `Based on your pattern, you typically experience ${pattern.metadata.mood} mood every ${pattern.periodicity} days. This is likely to occur around ${format(nextOccurrence, 'MMM d, yyyy')}.`,
          predicted_value: pattern.metadata.mood,
          predicted_date: nextOccurrence.toISOString(),
          confidence,
          confidence_score: confidenceScore,
          status: 'pending',
          source_patterns: [pattern.pattern_id],
          source_data: {
            pattern_type: pattern.pattern_type,
            frequency: pattern.frequency,
            periodicity: pattern.periodicity,
            last_occurrence: lastExample,
          },
          metadata: {
            pattern_id: pattern.pattern_id,
            days_until: daysUntil,
          },
          expires_at: addDays(nextOccurrence, 7).toISOString(),
        });
        break;

      case 'topic_recurrence':
        predictions.push({
          user_id: userId,
          type: 'pattern',
          title: `Topic likely to come up: ${pattern.metadata.tag}`,
          description: `You typically write about "${pattern.metadata.tag}" every ${pattern.periodicity} days. This topic may come up around ${format(nextOccurrence, 'MMM d, yyyy')}.`,
          predicted_value: pattern.metadata.tag,
          predicted_date: nextOccurrence.toISOString(),
          confidence,
          confidence_score: confidenceScore,
          status: 'pending',
          source_patterns: [pattern.pattern_id],
          source_data: {
            pattern_type: pattern.pattern_type,
            frequency: pattern.frequency,
            periodicity: pattern.periodicity,
          },
          metadata: {
            pattern_id: pattern.pattern_id,
            topic: pattern.metadata.tag,
            days_until: daysUntil,
          },
          expires_at: addDays(nextOccurrence, 7).toISOString(),
        });
        break;

      case 'relationship_interaction':
        predictions.push({
          user_id: userId,
          type: 'relationship',
          title: `Check-in with ${pattern.metadata.person}`,
          description: `You typically mention ${pattern.metadata.person} every ${pattern.periodicity} days. Consider checking in around ${format(nextOccurrence, 'MMM d, yyyy')}.`,
          predicted_value: pattern.metadata.person,
          predicted_date: nextOccurrence.toISOString(),
          confidence,
          confidence_score: confidenceScore,
          status: 'pending',
          source_patterns: [pattern.pattern_id],
          source_data: {
            pattern_type: pattern.pattern_type,
            frequency: pattern.frequency,
            periodicity: pattern.periodicity,
          },
          metadata: {
            pattern_id: pattern.pattern_id,
            person: pattern.metadata.person,
            days_until: daysUntil,
          },
          expires_at: addDays(nextOccurrence, 7).toISOString(),
        });
        break;

      case 'sentiment_trend':
        const trendDirection = pattern.trend === 'increasing' ? 'improve' : 'decline';
        predictions.push({
          user_id: userId,
          type: 'trend',
          title: `Sentiment trend: ${pattern.trend}`,
          description: `Your sentiment has been ${pattern.trend}. This trend is likely to continue over the next ${horizonDays} days.`,
          predicted_value: pattern.trend,
          predicted_date_range: {
            start: now.toISOString(),
            end: addDays(now, horizonDays).toISOString(),
          },
          confidence,
          confidence_score: confidenceScore * 0.8, // Trends are less certain
          status: 'pending',
          source_patterns: [pattern.pattern_id],
          source_data: {
            pattern_type: pattern.pattern_type,
            trend: pattern.trend,
            metadata: pattern.metadata,
          },
          metadata: {
            pattern_id: pattern.pattern_id,
            trend_direction: trendDirection,
          },
          expires_at: addDays(now, horizonDays).toISOString(),
        });
        break;

      case 'writing_frequency':
        if (pattern.trend === 'decreasing') {
          predictions.push({
            user_id: userId,
            type: 'behavior',
            title: 'Writing frequency declining',
            description: `Your writing frequency has been decreasing. You've been writing every ${pattern.periodicity} days on average. Consider setting a reminder to maintain your journaling habit.`,
            predicted_value: pattern.periodicity,
            confidence: 'medium',
            confidence_score: 0.6,
            status: 'pending',
            source_patterns: [pattern.pattern_id],
            source_data: {
              pattern_type: pattern.pattern_type,
              average_interval: pattern.periodicity,
            },
            metadata: {
              pattern_id: pattern.pattern_id,
              current_frequency_days: pattern.periodicity,
            },
            expires_at: addDays(now, 30).toISOString(),
          });
        }
        break;
    }

    return predictions;
  }

  /**
   * Map pattern strength to confidence level
   */
  private mapStrengthToConfidence(strength: number): PredictionConfidence {
    if (strength >= 0.8) return 'very_high';
    if (strength >= 0.65) return 'high';
    if (strength >= 0.5) return 'medium';
    return 'low';
  }
}

