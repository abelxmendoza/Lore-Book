/**
 * Character Analytics Module
 * Analyzes character mention frequency, sentiment trends, interaction scores, and activity patterns
 */

import { logger } from '../../logger';

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface CharacterStats {
  name: string;
  mentionCount: number;
  sentimentSum: number;
  sentimentCount: number;
  avgSentiment: number;
  firstMention: Date | null;
  lastMention: Date | null;
  recentMentions: number; // in last 30d
  buckets: Map<string, number>; // key: bucketLabel (e.g. "2025-11"), value: count
  interactionScore: number;
}

export class CharacterAnalyticsModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'characters' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    // Fetch memories with people[] populated
    const memories = await this.fetchMemoriesWithPeople(userId);

    if (memories.length === 0) {
      return this.emptyPayload();
    }

    // Build CharacterStats map
    const characterStatsMap = new Map<string, CharacterStats>();

    // Get current date for recency calculations
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Aggregate per-character stats
    for (const memory of memories) {
      const memoryDate = new Date(memory.created_at);
      const people = memory.people || [];
      const sentiment = memory.sentiment ?? 0;

      for (const personName of people) {
        const normalizedName = personName.trim();
        if (!normalizedName) continue;

        let stats = characterStatsMap.get(normalizedName);
        if (!stats) {
          stats = {
            name: normalizedName,
            mentionCount: 0,
            sentimentSum: 0,
            sentimentCount: 0,
            avgSentiment: 0,
            firstMention: null,
            lastMention: null,
            recentMentions: 0,
            buckets: new Map(),
            interactionScore: 0,
          };
          characterStatsMap.set(normalizedName, stats);
        }

        // Increment mention count
        stats.mentionCount++;

        // Accumulate sentiment
        if (sentiment !== null) {
          stats.sentimentSum += sentiment;
          stats.sentimentCount++;
        }

        // Update first/last mention dates
        if (!stats.firstMention || memoryDate < stats.firstMention) {
          stats.firstMention = memoryDate;
        }
        if (!stats.lastMention || memoryDate > stats.lastMention) {
          stats.lastMention = memoryDate;
        }

        // Check if recent (last 30 days)
        if (memoryDate >= thirtyDaysAgo) {
          stats.recentMentions++;
        }

        // Update time bucket (year-month format)
        const bucketLabel = this.getTimeBucket(memoryDate);
        stats.buckets.set(bucketLabel, (stats.buckets.get(bucketLabel) || 0) + 1);
      }
    }

    // Compute final stats
    const characterStats: CharacterStats[] = [];
    for (const stats of characterStatsMap.values()) {
      // Compute average sentiment
      stats.avgSentiment = stats.sentimentCount > 0
        ? stats.sentimentSum / stats.sentimentCount
        : 0;

      // Compute recency weight
      let recencyWeight = 0.4; // default for old mentions
      if (stats.lastMention) {
        if (stats.lastMention >= thirtyDaysAgo) {
          recencyWeight = 1.0;
        } else if (stats.lastMention >= ninetyDaysAgo) {
          recencyWeight = 0.7;
        }
      }

      // Compute interaction score
      // interactionScore = mentionCount * (1 + avgSentiment) * recencyWeight
      // avgSentiment is typically -1 to 1, so (1 + avgSentiment) ranges from 0 to 2
      stats.interactionScore = stats.mentionCount * (1 + stats.avgSentiment) * recencyWeight;

      characterStats.push(stats);
    }

    // Sort characters
    const sortedByMentions = [...characterStats].sort((a, b) => b.mentionCount - a.mentionCount);
    const sortedByInteraction = [...characterStats].sort((a, b) => b.interactionScore - a.interactionScore);

    // Build metrics
    const totalCharacters = characterStats.length;
    const mostMentioned = sortedByMentions[0]?.name || 'None';
    const topCharacter = sortedByInteraction[0]?.name || 'None';
    const averageSentiment = characterStats.length > 0
      ? characterStats.reduce((sum, s) => sum + s.avgSentiment, 0) / characterStats.length
      : 0;
    const activeCharacters = characterStats.filter(s => s.recentMentions > 0).length;

    // Build charts
    const charts = this.buildCharts(characterStats, sortedByMentions);

    // Build insights
    const insights = this.generateInsights(characterStats, sortedByMentions, sortedByInteraction);

    // Build summary
    const summary = this.generateSummary(
      totalCharacters,
      mostMentioned,
      topCharacter,
      activeCharacters,
      averageSentiment
    );

    const payload: AnalyticsPayload = {
      metrics: {
        totalCharacters,
        mostMentioned,
        averageSentiment: Math.round(averageSentiment * 100) / 100,
        activeCharacters,
        topCharacter,
      },
      charts,
      insights: insights.map(text => ({ text, category: 'character_analytics', score: 0.5 })),
      summary,
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Fetch memories with people[] populated
   */
  private async fetchMemoriesWithPeople(userId: string): Promise<MemoryData[]> {
    try {
      const { supabaseAdmin } = await import('../supabaseClient');
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at, sentiment, mood, tags, people')
        .eq('user_id', userId)
        .not('people', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        logger.error({ error, userId }, 'Error fetching memories with people');
        return [];
      }

      return (data || [])
        .filter(entry => entry.people && Array.isArray(entry.people) && entry.people.length > 0)
        .map(entry => ({
          id: entry.id,
          text: entry.content,
          created_at: entry.created_at,
          sentiment: entry.sentiment,
          mood: entry.mood,
          topics: entry.tags || [],
          people: entry.people || [],
          embedding: null,
        }));
    } catch (error) {
      logger.error({ error, userId }, 'Error fetching memories with people');
      return [];
    }
  }

  /**
   * Get time bucket label (year-month format)
   */
  private getTimeBucket(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Build charts from character stats
   */
  private buildCharts(
    characterStats: CharacterStats[],
    sortedByMentions: CharacterStats[]
  ): AnalyticsPayload['charts'] {
    const charts: AnalyticsPayload['charts'] = [];

    // 1. Mention Frequency Timeline (line chart) - Top 10 characters
    const topCharacters = sortedByMentions.slice(0, 10);
    if (topCharacters.length > 0) {
      // Collect all unique buckets
      const allBuckets = new Set<string>();
      topCharacters.forEach(stats => {
        stats.buckets.forEach((_, bucket) => allBuckets.add(bucket));
      });

      // Sort buckets chronologically
      const sortedBuckets = Array.from(allBuckets).sort();

      // Build data points
      const mentionFrequencyData = sortedBuckets.map(bucket => {
        const dataPoint: Record<string, any> = { bucket };
        topCharacters.forEach(stats => {
          dataPoint[stats.name] = stats.buckets.get(bucket) || 0;
        });
        return dataPoint;
      });

      charts.push({
        type: 'line',
        title: 'Mentions over time (Top Characters)',
        data: mentionFrequencyData,
        xAxis: 'bucket',
        yAxis: 'count',
        series: topCharacters.map(s => s.name),
      });
    }

    // 2. Sentiment Distribution (bar chart)
    const sentimentData = characterStats
      .filter(s => s.sentimentCount > 0)
      .sort((a, b) => b.avgSentiment - a.avgSentiment)
      .slice(0, 20)
      .map(stats => ({
        name: stats.name,
        avgSentiment: Math.round(stats.avgSentiment * 100) / 100,
      }));

    if (sentimentData.length > 0) {
      charts.push({
        type: 'bar',
        title: 'Average Sentiment per Character',
        data: sentimentData,
        xAxis: 'name',
        yAxis: 'avgSentiment',
      });
    }

    // 3. Interaction Scores (bar chart)
    const interactionData = characterStats
      .sort((a, b) => b.interactionScore - a.interactionScore)
      .slice(0, 20)
      .map(stats => ({
        name: stats.name,
        interactionScore: Math.round(stats.interactionScore * 100) / 100,
      }));

    if (interactionData.length > 0) {
      charts.push({
        type: 'bar',
        title: 'Character Interaction Scores',
        data: interactionData,
        xAxis: 'name',
        yAxis: 'interactionScore',
      });
    }

    return charts;
  }

  /**
   * Generate insights
   */
  private generateInsights(
    characterStats: CharacterStats[],
    sortedByMentions: CharacterStats[],
    sortedByInteraction: CharacterStats[]
  ): string[] {
    const insights: string[] = [];

    if (sortedByMentions.length > 0) {
      const mostMentioned = sortedByMentions[0];
      insights.push(`Most mentioned: ${mostMentioned.name} (${mostMentioned.mentionCount} mentions)`);
    }

    // Find characters with rising mentions (comparing recent to older)
    const risingCharacters = characterStats
      .filter(s => {
        if (s.buckets.size < 2) return false;
        const buckets = Array.from(s.buckets.entries()).sort();
        if (buckets.length < 2) return false;
        const recent = buckets[buckets.length - 1][1];
        const previous = buckets[buckets.length - 2][1];
        return recent > previous * 1.2; // 20% increase
      })
      .slice(0, 3);

    if (risingCharacters.length > 0) {
      risingCharacters.forEach(char => {
        insights.push(`${char.name} is rising in mentions over the last 30 days`);
      });
    }

    // Find characters with negative sentiment trends
    const negativeSentiment = characterStats
      .filter(s => s.avgSentiment < -0.3 && s.sentimentCount >= 3)
      .sort((a, b) => a.avgSentiment - b.avgSentiment)
      .slice(0, 2);

    if (negativeSentiment.length > 0) {
      negativeSentiment.forEach(char => {
        insights.push(`${char.name} has a strongly negative sentiment trend (${char.avgSentiment.toFixed(2)})`);
      });
    }

    // Find characters with positive sentiment
    const positiveSentiment = characterStats
      .filter(s => s.avgSentiment > 0.5 && s.sentimentCount >= 3)
      .sort((a, b) => b.avgSentiment - a.avgSentiment)
      .slice(0, 2);

    if (positiveSentiment.length > 0) {
      positiveSentiment.forEach(char => {
        insights.push(`${char.name} has consistently positive sentiment (${char.avgSentiment.toFixed(2)})`);
      });
    }

    if (sortedByInteraction.length > 0 && sortedByInteraction[0].name !== sortedByMentions[0]?.name) {
      insights.push(`${sortedByInteraction[0].name} has the highest interaction score, indicating strong recent engagement`);
    }

    return insights;
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    totalCharacters: number,
    mostMentioned: string,
    topCharacter: string,
    activeCharacters: number,
    averageSentiment: number
  ): string {
    let summary = `Your character landscape includes ${totalCharacters} unique character${totalCharacters !== 1 ? 's' : ''}. `;
    
    if (mostMentioned !== 'None') {
      summary += `${mostMentioned} is your most frequently mentioned character. `;
    }

    if (topCharacter !== 'None' && topCharacter !== mostMentioned) {
      summary += `${topCharacter} has the highest interaction score, showing strong recent engagement. `;
    }

    if (activeCharacters > 0) {
      summary += `${activeCharacters} character${activeCharacters !== 1 ? 's are' : ' is'} currently active (mentioned in the last 30 days). `;
    }

    if (averageSentiment > 0.2) {
      summary += `Overall sentiment around your characters is positive.`;
    } else if (averageSentiment < -0.2) {
      summary += `Overall sentiment around your characters is trending negative.`;
    } else {
      summary += `Overall sentiment around your characters is neutral.`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate character analytics. Start mentioning people in your journal entries.',
    };
  }
}

export const characterAnalyticsModule = new CharacterAnalyticsModule();

