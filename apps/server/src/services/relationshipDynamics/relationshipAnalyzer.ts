import { parseISO, differenceInDays, differenceInMonths } from 'date-fns';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  RelationshipInteraction,
  RelationshipMetrics,
  InteractionType,
} from './types';

/**
 * Analyzes relationship interactions and patterns
 */
export class RelationshipAnalyzer {
  /**
   * Analyze relationship for a person
   */
  async analyzeRelationship(
    userId: string,
    personName: string,
    lookbackMonths: number = 12
  ): Promise<{
    interactions: RelationshipInteraction[];
    metrics: RelationshipMetrics;
  } | null> {
    try {
      // Get entries mentioning this person
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);

      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .contains('people', [personName])
        .gte('date', cutoffDate.toISOString())
        .order('date', { ascending: true });

      if (error || !entries || entries.length === 0) {
        return null;
      }

      // Extract interactions
      const interactions = this.extractInteractions(entries, personName);

      // Calculate metrics
      const metrics = this.calculateMetrics(interactions, entries);

      logger.debug(
        { userId, personName, interactions: interactions.length },
        'Analyzed relationship'
      );

      return { interactions, metrics };
    } catch (error) {
      logger.error({ error, userId, personName }, 'Failed to analyze relationship');
      return null;
    }
  }

  /**
   * Extract interactions from entries
   */
  private extractInteractions(
    entries: any[],
    personName: string
  ): RelationshipInteraction[] {
    return entries.map(entry => {
      const sentiment = entry.sentiment ?? 0;
      const interactionType = this.determineInteractionType(sentiment, entry);

      return {
        entry_id: entry.id,
        date: entry.date,
        sentiment,
        interaction_type: interactionType,
        context: entry.content.substring(0, 200), // First 200 chars
        topics: entry.tags || [],
      };
    });
  }

  /**
   * Determine interaction type from sentiment and content
   */
  private determineInteractionType(sentiment: number, entry: any): InteractionType {
    // Check for conflict keywords
    const conflictKeywords = ['argue', 'fight', 'disagree', 'conflict', 'tension', 'angry'];
    const content = (entry.content || '').toLowerCase();
    const hasConflict = conflictKeywords.some(keyword => content.includes(keyword));

    if (hasConflict || sentiment < -0.5) {
      return 'conflict';
    }

    // Check for support keywords
    const supportKeywords = ['help', 'support', 'care', 'love', 'appreciate', 'grateful'];
    const hasSupport = supportKeywords.some(keyword => content.includes(keyword));

    if (hasSupport || sentiment > 0.5) {
      return 'support';
    }

    if (sentiment > 0.2) {
      return 'positive';
    }

    if (sentiment < -0.2) {
      return 'negative';
    }

    return 'neutral';
  }

  /**
   * Calculate relationship metrics
   */
  private calculateMetrics(
    interactions: RelationshipInteraction[],
    entries: any[]
  ): RelationshipMetrics {
    if (interactions.length === 0) {
      return {
        interaction_frequency: 0,
        average_sentiment: 0,
        sentiment_trend: 'stable',
        positive_ratio: 0,
        conflict_frequency: 0,
        support_frequency: 0,
        last_interaction_days_ago: 0,
        interaction_consistency: 0,
      };
    }

    // Calculate frequencies
    const firstDate = parseISO(entries[0].date);
    const lastDate = parseISO(entries[entries.length - 1].date);
    const monthsSpan = Math.max(1, differenceInMonths(lastDate, firstDate));
    const interactionFrequency = interactions.length / monthsSpan;

    // Calculate average sentiment
    const sentiments = interactions.map(i => i.sentiment);
    const averageSentiment =
      sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;

    // Calculate sentiment trend
    const sentimentTrend = this.calculateSentimentTrend(sentiments);

    // Calculate positive ratio
    const positiveCount = interactions.filter(
      i => i.interaction_type === 'positive' || i.interaction_type === 'support'
    ).length;
    const positiveRatio = positiveCount / interactions.length;

    // Calculate conflict and support frequencies
    const conflictCount = interactions.filter(i => i.interaction_type === 'conflict').length;
    const supportCount = interactions.filter(i => i.interaction_type === 'support').length;
    const conflictFrequency = conflictCount / monthsSpan;
    const supportFrequency = supportCount / monthsSpan;

    // Calculate last interaction
    const now = new Date();
    const lastInteractionDate = parseISO(entries[entries.length - 1].date);
    const lastInteractionDaysAgo = differenceInDays(now, lastInteractionDate);

    // Calculate interaction consistency (variance in intervals)
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const prev = parseISO(entries[i - 1].date);
      const curr = parseISO(entries[i].date);
      intervals.push(differenceInDays(curr, prev));
    }

    const consistency = this.calculateConsistency(intervals);

    return {
      interaction_frequency: interactionFrequency,
      average_sentiment: averageSentiment,
      sentiment_trend: sentimentTrend,
      positive_ratio: positiveRatio,
      conflict_frequency: conflictFrequency,
      support_frequency: supportFrequency,
      last_interaction_days_ago: lastInteractionDaysAgo,
      interaction_consistency: consistency,
    };
  }

  /**
   * Calculate sentiment trend
   */
  private calculateSentimentTrend(sentiments: number[]): 'improving' | 'declining' | 'stable' | 'volatile' {
    if (sentiments.length < 3) return 'stable';

    // Split into halves
    const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
    const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));

    const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;

    // Check volatility (high variance)
    const variance = sentiments.reduce((sum, s) => {
      const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
      return sum + Math.pow(s - avg, 2);
    }, 0) / sentiments.length;

    if (variance > 0.3) {
      return 'volatile';
    }

    const diff = secondAvg - firstAvg;
    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate consistency (lower variance = higher consistency)
   */
  private calculateConsistency(intervals: number[]): number {
    if (intervals.length < 2) return 0.5;

    const avg = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avg, 2), 0) / intervals.length;

    // Normalize to 0-1 (lower variance = higher consistency)
    const maxVariance = Math.max(...intervals) - Math.min(...intervals);
    return maxVariance === 0 ? 1 : Math.max(0, 1 - variance / maxVariance);
  }
}

