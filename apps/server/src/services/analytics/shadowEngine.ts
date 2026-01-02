/**
 * Shadow Engine Analytics Module
 * Detects suppressed topics, negative patterns, and shadow archetypes
 */

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface SuppressedTopic {
  topic: string;
  rarity: number; // How rarely it appears
  sentiment: number; // Average sentiment when it does appear
  suppressionScore: number;
}

interface ShadowArchetype {
  name: string;
  description: string;
  confidence: number;
  evidence: string[];
}

interface NegativePattern {
  pattern: string;
  frequency: number;
  impact: number;
  description: string;
}

export class ShadowEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'shadow' as const;
  private readonly SUPPRESSION_THRESHOLD = 0.3; // Minimum suppression score

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length < 10) {
      return this.emptyPayload();
    }

    // Detect suppressed topics
    const suppressedTopics = this.detectSuppressedTopics(memories);
    
    // Infer shadow archetypes
    const shadowArchetypes = this.inferShadowArchetypes(memories, suppressedTopics);
    
    // Detect negative patterns
    const negativePatterns = this.detectNegativePatterns(memories);

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        suppressedTopics: suppressedTopics.length,
        shadowArchetypes: shadowArchetypes.length,
        negativePatterns: negativePatterns.length,
        averageSuppressionScore: suppressedTopics.length > 0
          ? suppressedTopics.reduce((sum, t) => sum + t.suppressionScore, 0) / suppressedTopics.length
          : 0,
      },
      charts: [
        {
          type: 'bar',
          title: 'Suppressed Topics',
          data: suppressedTopics.map(t => ({
            topic: t.topic,
            score: t.suppressionScore,
          })),
          xAxis: 'topic',
          yAxis: 'score',
        },
      ],
      insights: [
        ...this.generateSuppressedTopicInsights(suppressedTopics),
        ...this.generateShadowArchetypeInsights(shadowArchetypes),
        ...this.generateNegativePatternInsights(negativePatterns),
      ],
      summary: this.generateSummary(suppressedTopics, shadowArchetypes, negativePatterns),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Detect suppressed topics using rarity and sentiment scoring
   */
  private detectSuppressedTopics(memories: MemoryData[]): SuppressedTopic[] {
    const suppressed: SuppressedTopic[] = [];
    
    // Count topic frequencies
    const topicCounts = new Map<string, number>();
    const topicSentiments = new Map<string, number[]>();
    
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        
        if (!topicSentiments.has(topic)) {
          topicSentiments.set(topic, []);
        }
        topicSentiments.get(topic)!.push(memory.sentiment ?? 0);
      }
    }

    const totalMemories = memories.length;
    const avgTopicFrequency = Array.from(topicCounts.values()).reduce((sum, count) => sum + count, 0) / topicCounts.size;

    // Identify suppressed topics (rare + negative sentiment)
    for (const [topic, count] of topicCounts.entries()) {
      const rarity = 1 - (count / totalMemories); // Higher = rarer
      const sentiments = topicSentiments.get(topic) || [];
      const avgSentiment = sentiments.length > 0
        ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
        : 0;

      // Suppression score: high rarity + negative sentiment
      const suppressionScore = (rarity * 0.6) + (Math.abs(Math.min(0, avgSentiment)) * 0.4);

      if (suppressionScore >= this.SUPPRESSION_THRESHOLD && avgSentiment < 0) {
        suppressed.push({
          topic,
          rarity,
          sentiment: avgSentiment,
          suppressionScore,
        });
      }
    }

    return suppressed.sort((a, b) => b.suppressionScore - a.suppressionScore).slice(0, 10);
  }

  /**
   * Infer shadow archetypes from suppressed topics and patterns
   */
  private inferShadowArchetypes(
    memories: MemoryData[],
    suppressedTopics: SuppressedTopic[]
  ): ShadowArchetype[] {
    const archetypes: ShadowArchetype[] = [];

    if (suppressedTopics.length === 0) {
      return archetypes;
    }

    // Group suppressed topics by theme
    const themes = this.groupTopicsByTheme(suppressedTopics);

    for (const [theme, topics] of themes.entries()) {
      const archetype = this.mapThemeToArchetype(theme, topics);
      if (archetype) {
        archetypes.push(archetype);
      }
    }

    return archetypes;
  }

  /**
   * Group topics by theme (simplified)
   */
  private groupTopicsByTheme(topics: SuppressedTopic[]): Map<string, SuppressedTopic[]> {
    const themes = new Map<string, SuppressedTopic[]>();

    // Simple keyword-based grouping
    const themeKeywords: Record<string, string[]> = {
      'failure': ['fail', 'mistake', 'error', 'wrong', 'bad'],
      'rejection': ['reject', 'ignore', 'abandon', 'leave', 'alone'],
      'shame': ['shame', 'embarrass', 'guilt', 'ashamed', 'humiliate'],
      'anger': ['angry', 'mad', 'furious', 'rage', 'resent'],
      'fear': ['fear', 'afraid', 'scared', 'anxious', 'worry'],
    };

    for (const topic of topics) {
      const topicLower = topic.topic.toLowerCase();
      let matched = false;

      for (const [theme, keywords] of Object.entries(themeKeywords)) {
        if (keywords.some(keyword => topicLower.includes(keyword))) {
          if (!themes.has(theme)) {
            themes.set(theme, []);
          }
          themes.get(theme)!.push(topic);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Default theme
        if (!themes.has('unexplored')) {
          themes.set('unexplored', []);
        }
        themes.get('unexplored')!.push(topic);
      }
    }

    return themes;
  }

  /**
   * Map theme to shadow archetype
   */
  private mapThemeToArchetype(theme: string, topics: SuppressedTopic[]): ShadowArchetype | null {
    const archetypeMap: Record<string, { name: string; description: string }> = {
      'failure': {
        name: 'The Perfectionist',
        description: 'Suppressed fear of failure and mistakes. May avoid taking risks or trying new things.',
      },
      'rejection': {
        name: 'The Abandoned',
        description: 'Suppressed fear of rejection and abandonment. May struggle with intimacy and trust.',
      },
      'shame': {
        name: 'The Hidden',
        description: 'Suppressed shame and self-criticism. May hide true self to avoid judgment.',
      },
      'anger': {
        name: 'The Repressed',
        description: 'Suppressed anger and resentment. May struggle with assertiveness and boundaries.',
      },
      'fear': {
        name: 'The Anxious',
        description: 'Suppressed fears and anxieties. May avoid situations that trigger anxiety.',
      },
      'unexplored': {
        name: 'The Unknown',
        description: 'Topics rarely explored. May represent untapped aspects of your experience.',
      },
    };

    const archetype = archetypeMap[theme];
    if (!archetype) {
      return null;
    }

    const avgSuppression = topics.reduce((sum, t) => sum + t.suppressionScore, 0) / topics.length;
    const evidence = topics.slice(0, 3).map(t => `"${t.topic}" (suppression: ${(t.suppressionScore * 100).toFixed(0)}%)`);

    return {
      name: archetype.name,
      description: archetype.description,
      confidence: Math.min(1, avgSuppression),
      evidence,
    };
  }

  /**
   * Detect negative patterns using autocorrelation and sentiment analysis
   */
  private detectNegativePatterns(memories: MemoryData[]): NegativePattern[] {
    const patterns: NegativePattern[] = [];

    if (memories.length < 14) {
      return patterns;
    }

    // Extract negative sentiment periods
    const negativePeriods: Array<{ start: number; end: number; intensity: number }> = [];
    let inNegativePeriod = false;
    let periodStart = 0;
    let periodIntensity = 0;

    const sentiments = memories.map(m => m.sentiment ?? 0);
    
    for (let i = 0; i < sentiments.length; i++) {
      if (sentiments[i] < -0.3) {
        if (!inNegativePeriod) {
          inNegativePeriod = true;
          periodStart = i;
          periodIntensity = Math.abs(sentiments[i]);
        } else {
          periodIntensity = Math.max(periodIntensity, Math.abs(sentiments[i]));
        }
      } else {
        if (inNegativePeriod) {
          negativePeriods.push({
            start: periodStart,
            end: i - 1,
            intensity: periodIntensity,
          });
          inNegativePeriod = false;
        }
      }
    }

    // Detect recurring negative patterns
    if (negativePeriods.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < negativePeriods.length; i++) {
        const interval = negativePeriods[i].start - negativePeriods[i - 1].end;
        intervals.push(interval);
      }

      if (intervals.length > 0) {
        const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        const variance = this.standardDeviation(intervals);
        
        // If intervals are relatively consistent, it's a pattern
        if (variance < avgInterval * 0.5) {
          patterns.push({
            pattern: 'Recurring negative cycles',
            frequency: Math.round(avgInterval),
            impact: negativePeriods.reduce((sum, p) => sum + p.intensity, 0) / negativePeriods.length,
            description: `Negative sentiment cycles occur approximately every ${Math.round(avgInterval)} days.`,
          });
        }
      }
    }

    // Detect negative topic loops
    const negativeTopics = this.detectNegativeTopicLoops(memories);
    patterns.push(...negativeTopics);

    return patterns;
  }

  /**
   * Detect negative topic loops
   */
  private detectNegativeTopicLoops(memories: MemoryData[]): NegativePattern[] {
    const patterns: NegativePattern[] = [];
    const topicSentimentMap = new Map<string, number[]>();

    // Build sentiment map for each topic
    for (const memory of memories) {
      const sentiment = memory.sentiment ?? 0;
      for (const topic of memory.topics || []) {
        if (!topicSentimentMap.has(topic)) {
          topicSentimentMap.set(topic, []);
        }
        topicSentimentMap.get(topic)!.push(sentiment);
      }
    }

    // Find topics with consistently negative sentiment
    for (const [topic, sentiments] of topicSentimentMap.entries()) {
      if (sentiments.length < 3) continue;

      const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
      const negativeCount = sentiments.filter(s => s < -0.3).length;
      const negativeRatio = negativeCount / sentiments.length;

      if (avgSentiment < -0.4 && negativeRatio > 0.6) {
        patterns.push({
          pattern: `Negative topic: ${topic}`,
          frequency: sentiments.length,
          impact: Math.abs(avgSentiment),
          description: `"${topic}" consistently appears with negative sentiment (${(negativeRatio * 100).toFixed(0)}% of mentions).`,
        });
      }
    }

    return patterns;
  }

  /**
   * Generate insights
   */
  private generateSuppressedTopicInsights(suppressedTopics: SuppressedTopic[]): Array<{ text: string; category: string; score: number }> {
    if (suppressedTopics.length === 0) {
      return [];
    }

    const topSuppressed = suppressedTopics[0];

    return [
      {
        text: `"${topSuppressed.topic}" appears rarely but with negative sentiment, suggesting it may be a suppressed topic worth exploring.`,
        category: 'suppressed_topic',
        score: topSuppressed.suppressionScore,
      },
    ];
  }

  private generateShadowArchetypeInsights(archetypes: ShadowArchetype[]): Array<{ text: string; category: string; score: number }> {
    return archetypes.map(archetype => ({
      text: `${archetype.name}: ${archetype.description}`,
      category: 'shadow_archetype',
      score: archetype.confidence,
    }));
  }

  private generateNegativePatternInsights(patterns: NegativePattern[]): Array<{ text: string; category: string; score: number }> {
    return patterns.map(pattern => ({
      text: pattern.description,
      category: 'negative_pattern',
      score: pattern.impact,
    }));
  }

  private generateSummary(
    suppressedTopics: SuppressedTopic[],
    shadowArchetypes: ShadowArchetype[],
    negativePatterns: NegativePattern[]
  ): string {
    let summary = `Shadow analysis revealed `;
    
    if (suppressedTopics.length > 0) {
      summary += `${suppressedTopics.length} suppressed topic${suppressedTopics.length > 1 ? 's' : ''}, `;
    }
    
    if (shadowArchetypes.length > 0) {
      summary += `${shadowArchetypes.length} shadow archetype${shadowArchetypes.length > 1 ? 's' : ''}, `;
    }
    
    summary += `and ${negativePatterns.length} negative pattern${negativePatterns.length > 1 ? 's' : ''}. `;
    
    if (shadowArchetypes.length > 0) {
      summary += `The most prominent shadow archetype is "${shadowArchetypes[0].name}".`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate shadow analytics.',
    };
  }
}

export const shadowEngineModule = new ShadowEngineModule();
