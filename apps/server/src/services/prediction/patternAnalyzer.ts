import { parseISO, differenceInDays, addDays, format } from 'date-fns';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { PatternAnalysis } from './types';

/**
 * Analyzes temporal patterns in user data
 */
export class PatternAnalyzer {
  /**
   * Analyze patterns in journal entries
   */
  async analyzeEntryPatterns(
    userId: string,
    lookbackDays: number = 365
  ): Promise<PatternAnalysis[]> {
    const patterns: PatternAnalysis[] = [];

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

      // Get entries
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, content, mood, sentiment, tags, people')
        .eq('user_id', userId)
        .gte('date', cutoffDate.toISOString())
        .order('date', { ascending: true });

      if (error || !entries || entries.length < 3) {
        return patterns;
      }

      // Analyze mood patterns
      const moodPatterns = this.analyzeMoodPatterns(entries);
      patterns.push(...moodPatterns);

      // Analyze tag patterns (topics)
      const tagPatterns = this.analyzeTagPatterns(entries);
      patterns.push(...tagPatterns);

      // Analyze people patterns
      const peoplePatterns = this.analyzePeoplePatterns(entries);
      patterns.push(...peoplePatterns);

      // Analyze sentiment trends
      const sentimentPatterns = this.analyzeSentimentPatterns(entries);
      patterns.push(...sentimentPatterns);

      // Analyze writing frequency
      const frequencyPatterns = this.analyzeFrequencyPatterns(entries);
      patterns.push(...frequencyPatterns);

      logger.debug(
        { userId, patterns: patterns.length },
        'Analyzed entry patterns'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze entry patterns');
    }

    return patterns;
  }

  /**
   * Analyze mood patterns
   */
  private analyzeMoodPatterns(entries: any[]): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];
    const moodGroups = new Map<string, any[]>();

    // Group by mood
    entries.forEach(entry => {
      if (entry.mood) {
        if (!moodGroups.has(entry.mood)) {
          moodGroups.set(entry.mood, []);
        }
        moodGroups.get(entry.mood)!.push(entry);
      }
    });

    // Analyze each mood
    for (const [mood, moodEntries] of moodGroups) {
      if (moodEntries.length < 3) continue;

      const dates = moodEntries.map(e => parseISO(e.date)).sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];

      for (let i = 1; i < dates.length; i++) {
        intervals.push(differenceInDays(dates[i], dates[i - 1]));
      }

      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
      const variance = intervals.reduce((sum, d) => sum + Math.pow(d - avgInterval, 2), 0) / intervals.length;
      const consistency = 1 / (1 + variance / (avgInterval || 1)); // Higher variance = lower consistency

      if (consistency > 0.3 && avgInterval < 90) {
        patterns.push({
          pattern_id: `mood_${mood}`,
          pattern_type: 'mood_recurrence',
          frequency: moodEntries.length,
          periodicity: Math.round(avgInterval),
          strength: Math.min(consistency, 0.9),
          examples: moodEntries.slice(0, 5).map(e => e.id),
          trend: this.determineTrend(moodEntries.map(e => e.date)),
          metadata: {
            mood,
            average_interval_days: Math.round(avgInterval),
            consistency_score: consistency,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze tag patterns
   */
  private analyzeTagPatterns(entries: any[]): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];
    const tagFrequency = new Map<string, any[]>();

    entries.forEach(entry => {
      (entry.tags || []).forEach((tag: string) => {
        if (!tagFrequency.has(tag)) {
          tagFrequency.set(tag, []);
        }
        tagFrequency.get(tag)!.push(entry);
      });
    });

    // Analyze frequent tags
    for (const [tag, tagEntries] of tagFrequency) {
      if (tagEntries.length < 3) continue;

      const dates = tagEntries.map(e => parseISO(e.date)).sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];

      for (let i = 1; i < dates.length; i++) {
        intervals.push(differenceInDays(dates[i], dates[i - 1]));
      }

      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
      const variance = intervals.reduce((sum, d) => sum + Math.pow(d - avgInterval, 2), 0) / intervals.length;
      const consistency = 1 / (1 + variance / (avgInterval || 1));

      if (consistency > 0.25) {
        patterns.push({
          pattern_id: `tag_${tag}`,
          pattern_type: 'topic_recurrence',
          frequency: tagEntries.length,
          periodicity: Math.round(avgInterval),
          strength: Math.min(consistency, 0.85),
          examples: tagEntries.slice(0, 5).map(e => e.id),
          trend: this.determineTrend(tagEntries.map(e => e.date)),
          metadata: {
            tag,
            average_interval_days: Math.round(avgInterval),
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze people patterns
   */
  private analyzePeoplePatterns(entries: any[]): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];
    const peopleFrequency = new Map<string, any[]>();

    entries.forEach(entry => {
      (entry.people || []).forEach((person: string) => {
        if (!peopleFrequency.has(person)) {
          peopleFrequency.set(person, []);
        }
        peopleFrequency.get(person)!.push(entry);
      });
    });

    // Analyze frequent people
    for (const [person, personEntries] of peopleFrequency) {
      if (personEntries.length < 3) continue;

      const dates = personEntries.map(e => parseISO(e.date)).sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];

      for (let i = 1; i < dates.length; i++) {
        intervals.push(differenceInDays(dates[i], dates[i - 1]));
      }

      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
      const variance = intervals.reduce((sum, d) => sum + Math.pow(d - avgInterval, 2), 0) / intervals.length;
      const consistency = 1 / (1 + variance / (avgInterval || 1));

      if (consistency > 0.25 && avgInterval < 60) {
        patterns.push({
          pattern_id: `person_${person}`,
          pattern_type: 'relationship_interaction',
          frequency: personEntries.length,
          periodicity: Math.round(avgInterval),
          strength: Math.min(consistency, 0.8),
          examples: personEntries.slice(0, 5).map(e => e.id),
          trend: this.determineTrend(personEntries.map(e => e.date)),
          metadata: {
            person,
            average_interval_days: Math.round(avgInterval),
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze sentiment trends
   */
  private analyzeSentimentPatterns(entries: any[]): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];

    if (entries.length < 7) return patterns;

    // Calculate sentiment trend
    const sentiments = entries
      .filter(e => e.sentiment !== null)
      .map(e => ({ date: parseISO(e.date), sentiment: e.sentiment }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sentiments.length < 7) return patterns;

    // Simple trend detection
    const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
    const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));

    const firstAvg = firstHalf.reduce((sum, s) => sum + s.sentiment, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.sentiment, 0) / secondHalf.length;

    const trend = secondAvg > firstAvg ? 'increasing' : secondAvg < firstAvg ? 'decreasing' : 'stable';
    const change = Math.abs(secondAvg - firstAvg);

    if (change > 0.1) {
      patterns.push({
        pattern_id: 'sentiment_trend',
        pattern_type: 'sentiment_trend',
        frequency: sentiments.length,
        strength: Math.min(change * 2, 0.9),
        examples: sentiments.slice(0, 5).map(s => s.date.toISOString()),
        trend,
        metadata: {
          first_half_avg: firstAvg,
          second_half_avg: secondAvg,
          change_magnitude: change,
        },
      });
    }

    return patterns;
  }

  /**
   * Analyze writing frequency patterns
   */
  private analyzeFrequencyPatterns(entries: any[]): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];

    if (entries.length < 7) return patterns;

    const dates = entries.map(e => parseISO(e.date)).sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < dates.length; i++) {
      intervals.push(differenceInDays(dates[i], dates[i - 1]));
    }

    const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;

    patterns.push({
      pattern_id: 'writing_frequency',
      pattern_type: 'writing_frequency',
      frequency: entries.length,
      periodicity: Math.round(avgInterval),
      strength: 0.7,
      examples: entries.slice(0, 5).map(e => e.id),
      trend: avgInterval < 3 ? 'increasing' : avgInterval > 7 ? 'decreasing' : 'stable',
      metadata: {
        average_days_between_entries: Math.round(avgInterval),
        total_entries: entries.length,
      },
    });

    return patterns;
  }

  /**
   * Determine trend from dates
   */
  private determineTrend(dates: string[]): 'increasing' | 'decreasing' | 'stable' | 'cyclical' {
    if (dates.length < 3) return 'stable';

    const parsed = dates.map(d => parseISO(d)).sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < parsed.length; i++) {
      intervals.push(differenceInDays(parsed[i], parsed[i - 1]));
    }

    // Check if intervals are decreasing (increasing frequency)
    const firstHalf = intervals.slice(0, Math.floor(intervals.length / 2));
    const secondHalf = intervals.slice(Math.floor(intervals.length / 2));

    const firstAvg = firstHalf.reduce((sum, d) => sum + d, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, d) => sum + d, 0) / secondHalf.length;

    if (secondAvg < firstAvg * 0.8) return 'increasing';
    if (secondAvg > firstAvg * 1.2) return 'decreasing';

    // Check for cyclical pattern (variance in intervals)
    const variance = intervals.reduce((sum, d) => {
      const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length;
      return sum + Math.pow(d - avg, 2);
    }, 0) / intervals.length;

    if (variance > firstAvg * 0.5) return 'cyclical';

    return 'stable';
  }
}

