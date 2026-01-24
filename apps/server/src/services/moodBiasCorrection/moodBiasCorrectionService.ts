/**
 * Mood Bias Correction Service
 * 
 * Detects and corrects mood bias in journal entries:
 * - Detects when journal skews negative or positive
 * - Suggests balanced perspectives
 * - Tracks mood patterns over time
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface MoodBiasAnalysis {
  detected_bias: 'negative' | 'positive' | 'dramatic' | 'suppressed' | null;
  entries_affected: string[];
  correction_suggestions: string[];
  mood_distribution: {
    negative: number;
    positive: number;
    neutral: number;
  };
  recent_entries_count: number;
}

class MoodBiasCorrectionService {
  /**
   * Analyze mood bias in recent entries
   */
  async analyzeMoodBias(
    userId: string,
    days: number = 30
  ): Promise<MoodBiasAnalysis> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get recent entries with moods
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, mood, sentiment, created_at')
        .eq('user_id', userId)
        .gte('created_at', cutoffDate.toISOString())
        .not('mood', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      if (!entries || entries.length === 0) {
        return {
          detected_bias: null,
          entries_affected: [],
          correction_suggestions: [],
          mood_distribution: { negative: 0, positive: 0, neutral: 0 },
          recent_entries_count: 0,
        };
      }

      // Categorize moods
      const negativeMoods = ['angry', 'sad', 'frustrated', 'anxious', 'stressed', 'lonely', 'depressed', 'worried'];
      const positiveMoods = ['happy', 'excited', 'grateful', 'content', 'peaceful', 'joyful', 'optimistic', 'proud'];
      const neutralMoods = ['neutral', 'calm', 'tired', 'bored'];

      let negativeCount = 0;
      let positiveCount = 0;
      let neutralCount = 0;

      for (const entry of entries) {
        const mood = entry.mood?.toLowerCase() || '';
        if (negativeMoods.some(m => mood.includes(m))) {
          negativeCount++;
        } else if (positiveMoods.some(m => mood.includes(m))) {
          positiveCount++;
        } else {
          neutralCount++;
        }
      }

      const total = entries.length;
      const negativeRatio = negativeCount / total;
      const positiveRatio = positiveCount / total;
      const neutralRatio = neutralCount / total;

      // Detect bias
      let detectedBias: MoodBiasAnalysis['detected_bias'] = null;
      const correctionSuggestions: string[] = [];
      const entriesAffected = entries.map(e => e.id);

      if (negativeRatio > 0.7) {
        detectedBias = 'negative';
        correctionSuggestions.push('What went well today that you might not have mentioned?');
        correctionSuggestions.push('Are there positive aspects of this situation you\'re overlooking?');
        correctionSuggestions.push('Consider writing about something you\'re grateful for.');
      } else if (positiveRatio > 0.7) {
        detectedBias = 'positive';
        correctionSuggestions.push('Are there any challenges or difficulties you\'re not acknowledging?');
        correctionSuggestions.push('What might be harder than you\'re letting on?');
        correctionSuggestions.push('Consider writing about what\'s difficult right now.');
      } else if (neutralRatio > 0.8) {
        detectedBias = 'suppressed';
        correctionSuggestions.push('What emotions are you feeling that you\'re not expressing?');
        correctionSuggestions.push('How are you really feeling about recent events?');
      }

      // Detect dramatic bias (high variance)
      const sentiments = entries
        .filter(e => e.sentiment !== null)
        .map(e => e.sentiment as number);

      if (sentiments.length > 5) {
        const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sentiments.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0.5) {
          detectedBias = 'dramatic';
          correctionSuggestions.push('Your entries show high emotional variance. Consider what\'s causing the swings.');
          correctionSuggestions.push('Try to find the middle ground between extremes.');
        }
      }

      return {
        detected_bias: detectedBias,
        entries_affected: entriesAffected,
        correction_suggestions: correctionSuggestions,
        mood_distribution: {
          negative: negativeCount,
          positive: positiveCount,
          neutral: neutralCount,
        },
        recent_entries_count: total,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to analyze mood bias');
      throw error;
    }
  }

  /**
   * Get mood distribution over time
   */
  async getMoodDistribution(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; mood: string; count: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('mood, created_at')
        .eq('user_id', userId)
        .gte('created_at', cutoffDate.toISOString())
        .not('mood', 'is', null);

      if (error) {
        throw error;
      }

      if (!entries) return [];

      // Group by date and mood
      const distribution = new Map<string, Map<string, number>>();

      for (const entry of entries) {
        const date = new Date(entry.created_at).toISOString().split('T')[0];
        const mood = entry.mood || 'unknown';

        if (!distribution.has(date)) {
          distribution.set(date, new Map());
        }

        const dayMap = distribution.get(date)!;
        dayMap.set(mood, (dayMap.get(mood) || 0) + 1);
      }

      const result: Array<{ date: string; mood: string; count: number }> = [];
      for (const [date, moodMap] of distribution.entries()) {
        for (const [mood, count] of moodMap.entries()) {
          result.push({ date, mood, count });
        }
      }

      return result.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get mood distribution');
      return [];
    }
  }
}

export const moodBiasCorrectionService = new MoodBiasCorrectionService();
