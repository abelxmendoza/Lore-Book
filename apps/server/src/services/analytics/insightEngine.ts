/**
 * Insight Engine Analytics Module
 * Detects correlations, behavioral loops, and patterns
 */

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface Correlation {
  variable1: string;
  variable2: string;
  coefficient: number;
  significance: number;
}

interface BehavioralLoop {
  pattern: string;
  frequency: number; // days
  strength: number;
  description: string;
}

export class InsightEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'insights' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length < 10) {
      return this.emptyPayload();
    }

    // Sort by date
    memories.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Compute correlations
    const correlations = this.computeCorrelations(memories);
    
    // Detect behavioral loops
    const loops = this.detectBehavioralLoops(memories);
    
    // Detect behavior patterns
    const patterns = this.detectBehaviorPatterns(memories);
    
    // Generate weekly highlights
    const weeklyHighlights = this.generateWeeklyHighlights(memories);

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        correlations: correlations.length,
        loops: loops.length,
        patterns: patterns.length,
        weeklyHighlights: weeklyHighlights.length,
        averageCorrelation: correlations.length > 0
          ? correlations.reduce((sum, c) => sum + Math.abs(c.coefficient), 0) / correlations.length
          : 0,
      },
      charts: [
        {
          type: 'scatter',
          title: 'Mood vs Topic Correlations',
          data: correlations
            .filter(c => c.variable1 === 'sentiment' || c.variable2 === 'sentiment')
            .map(c => ({
              x: c.variable1 === 'sentiment' ? c.variable2 : c.variable1,
              y: c.coefficient,
            })),
          xAxis: 'topic',
          yAxis: 'correlation',
        },
      ],
      insights: [
        ...this.generateCorrelationInsights(correlations),
        ...this.generateLoopInsights(loops),
        ...this.generatePatternInsights(patterns),
        ...weeklyHighlights.map(h => ({
          text: h,
          category: 'weekly_highlight',
          score: 0.8,
        })),
      ],
      summary: this.generateSummary(correlations, loops, patterns, memories),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Compute correlation matrix (Pearson correlation)
   */
  private computeCorrelations(memories: MemoryData[]): Correlation[] {
    const correlations: Correlation[] = [];

    // Extract time series data
    const sentiments = memories.map(m => m.sentiment ?? 0);
    const dates = memories.map(m => new Date(m.created_at).getTime());
    
    // Get all unique topics
    const allTopics = new Set<string>();
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        allTopics.add(topic);
      }
    }

    // Get all unique people
    const allPeople = new Set<string>();
    for (const memory of memories) {
      for (const person of memory.people || []) {
        allPeople.add(person);
      }
    }

    // Correlate sentiment with topics
    for (const topic of Array.from(allTopics).slice(0, 10)) { // Limit to top 10
      const topicPresence = memories.map(m => 
        (m.topics || []).includes(topic) ? 1 : 0
      );
      
      const correlation = this.pearsonCorrelation(sentiments, topicPresence);
      if (Math.abs(correlation) > 0.3) { // Significant correlation
        correlations.push({
          variable1: 'sentiment',
          variable2: topic,
          coefficient: correlation,
          significance: Math.abs(correlation),
        });
      }
    }

    // Correlate sentiment with people
    for (const person of Array.from(allPeople).slice(0, 10)) { // Limit to top 10
      const personPresence = memories.map(m => 
        (m.people || []).includes(person) ? 1 : 0
      );
      
      const correlation = this.pearsonCorrelation(sentiments, personPresence);
      if (Math.abs(correlation) > 0.3) { // Significant correlation
        correlations.push({
          variable1: 'sentiment',
          variable2: person,
          coefficient: correlation,
          significance: Math.abs(correlation),
        });
      }
    }

    return correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }

  /**
   * Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      return 0;
    }

    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect behavioral loops using autocorrelation (ACF)
   */
  private detectBehavioralLoops(memories: MemoryData[]): BehavioralLoop[] {
    const loops: BehavioralLoop[] = [];

    if (memories.length < 14) {
      return loops; // Need at least 2 weeks of data
    }

    // Extract sentiment time series
    const sentiments = memories.map(m => m.sentiment ?? 0);
    const dates = memories.map(m => new Date(m.created_at));

    // Compute autocorrelation for different lags (in days)
    const maxLag = Math.min(30, Math.floor(memories.length / 2));
    const autocorrelations: Array<{ lag: number; correlation: number }> = [];

    for (let lag = 7; lag <= maxLag; lag += 7) { // Check weekly patterns
      const correlation = this.autocorrelation(sentiments, lag);
      autocorrelations.push({ lag, correlation });
    }

    // Find significant patterns (correlation > 0.5)
    for (const ac of autocorrelations) {
      if (Math.abs(ac.correlation) > 0.5) {
        loops.push({
          pattern: `Sentiment cycle`,
          frequency: ac.lag,
          strength: Math.abs(ac.correlation),
          description: `Every ${ac.lag} days, your sentiment shows a ${ac.correlation > 0 ? 'positive' : 'negative'} correlation with itself, suggesting a recurring pattern.`,
        });
      }
    }

    // Detect topic-based loops
    const topicLoops = this.detectTopicLoops(memories);
    loops.push(...topicLoops);

    return loops.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Autocorrelation function (ACF)
   */
  private autocorrelation(data: number[], lag: number): number {
    if (lag >= data.length) {
      return 0;
    }

    const n = data.length - lag;
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = data[i] - mean;
      const diff2 = data[i + lag] - mean;
      numerator += diff1 * diff2;
      denominator += diff1 * diff1;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect topic-based loops
   */
  private detectTopicLoops(memories: MemoryData[]): BehavioralLoop[] {
    const loops: BehavioralLoop[] = [];
    const topicCounts = new Map<string, number[]>();

    // Build time series for each topic
    for (const memory of memories) {
      const date = new Date(memory.created_at);
      const dayIndex = Math.floor((date.getTime() - new Date(memories[0].created_at).getTime()) / (1000 * 60 * 60 * 24));

      for (const topic of memory.topics || []) {
        if (!topicCounts.has(topic)) {
          topicCounts.set(topic, new Array(dayIndex + 1).fill(0));
        }
        const series = topicCounts.get(topic)!;
        while (series.length <= dayIndex) {
          series.push(0);
        }
        series[dayIndex] = 1; // Binary: topic present or not
      }
    }

    // Check for periodic patterns in topics
    for (const [topic, series] of topicCounts.entries()) {
      if (series.length < 14) continue;

      // Check for weekly patterns
      const weeklyCorrelation = this.autocorrelation(series, 7);
      if (Math.abs(weeklyCorrelation) > 0.4) {
        loops.push({
          pattern: `Topic: ${topic}`,
          frequency: 7,
          strength: Math.abs(weeklyCorrelation),
          description: `"${topic}" appears in a weekly cycle, suggesting a recurring habit or routine.`,
        });
      }
    }

    return loops;
  }

  /**
   * Detect behavior patterns
   */
  private detectBehaviorPatterns(memories: MemoryData[]): Array<{ pattern: string; description: string; confidence: number }> {
    const patterns: Array<{ pattern: string; description: string; confidence: number }> = [];

    // Pattern: Writing frequency
    const writingFrequency = this.computeWritingFrequency(memories);
    if (writingFrequency > 0) {
      patterns.push({
        pattern: 'Writing Frequency',
        description: `You write ${writingFrequency.toFixed(1)} times per week on average.`,
        confidence: 0.8,
      });
    }

    // Pattern: Sentiment trends
    const sentimentTrend = this.computeSentimentTrend(memories);
    if (Math.abs(sentimentTrend) > 0.1) {
      patterns.push({
        pattern: 'Sentiment Trend',
        description: `Your overall sentiment is ${sentimentTrend > 0 ? 'improving' : 'declining'} over time.`,
        confidence: Math.abs(sentimentTrend),
      });
    }

    // Pattern: Topic diversity
    const topicDiversity = this.computeTopicDiversity(memories);
    patterns.push({
      pattern: 'Topic Diversity',
      description: `You write about ${topicDiversity.toFixed(1)} different topics on average.`,
      confidence: Math.min(1, topicDiversity / 10),
    });

    return patterns;
  }

  /**
   * Compute writing frequency (entries per week)
   */
  private computeWritingFrequency(memories: MemoryData[]): number {
    if (memories.length < 2) {
      return 0;
    }

    const dates = memories.map(m => new Date(m.created_at));
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const days = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
    const weeks = Math.max(1, days / 7);

    return memories.length / weeks;
  }

  /**
   * Compute sentiment trend (slope)
   */
  private computeSentimentTrend(memories: MemoryData[]): number {
    if (memories.length < 2) {
      return 0;
    }

    const sentiments = memories.map(m => m.sentiment ?? 0);
    const n = sentiments.length;
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += sentiments[i];
      sumXY += i * sentiments[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Compute topic diversity (average unique topics per entry)
   */
  private computeTopicDiversity(memories: MemoryData[]): number {
    if (memories.length === 0) {
      return 0;
    }

    const totalTopics = memories.reduce((sum, m) => sum + (m.topics?.length || 0), 0);
    return totalTopics / memories.length;
  }

  /**
   * Generate weekly highlights
   */
  private generateWeeklyHighlights(memories: MemoryData[]): string[] {
    const highlights: string[] = [];

    if (memories.length === 0) {
      return highlights;
    }

    // Group by week
    const weeklyGroups = new Map<string, MemoryData[]>();
    
    for (const memory of memories) {
      const date = new Date(memory.created_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyGroups.has(weekKey)) {
        weeklyGroups.set(weekKey, []);
      }
      weeklyGroups.get(weekKey)!.push(memory);
    }

    // Generate highlight for each week
    for (const [weekKey, weekMemories] of weeklyGroups.entries()) {
      if (weekMemories.length === 0) continue;

      const avgSentiment = weekMemories.reduce((sum, m) => sum + (m.sentiment ?? 0), 0) / weekMemories.length;
      const topTopics = this.getTopTopics(weekMemories, 3);
      
      let highlight = `Week of ${weekKey}: ${weekMemories.length} entries`;
      if (topTopics.length > 0) {
        highlight += ` focused on ${topTopics.join(', ')}`;
      }
      if (avgSentiment > 0.3) {
        highlight += ` with positive sentiment`;
      } else if (avgSentiment < -0.3) {
        highlight += ` with challenging moments`;
      }

      highlights.push(highlight);
    }

    return highlights.slice(-4); // Last 4 weeks
  }

  /**
   * Get top topics from memories
   */
  private getTopTopics(memories: MemoryData[], count: number): string[] {
    const topicCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([topic]) => topic);
  }

  /**
   * Generate insights
   */
  private generateCorrelationInsights(correlations: Correlation[]): Array<{ text: string; category: string; score: number }> {
    if (correlations.length === 0) {
      return [];
    }

    const topCorrelation = correlations[0];
    const direction = topCorrelation.coefficient > 0 ? 'positively' : 'negatively';

    return [
      {
        text: `${topCorrelation.variable1} and ${topCorrelation.variable2} are ${direction} correlated (${topCorrelation.coefficient.toFixed(2)}).`,
        category: 'correlation',
        score: Math.abs(topCorrelation.coefficient),
      },
    ];
  }

  private generateLoopInsights(loops: BehavioralLoop[]): Array<{ text: string; category: string; score: number }> {
    if (loops.length === 0) {
      return [];
    }

    return loops.slice(0, 3).map(loop => ({
      text: loop.description,
      category: 'behavioral_loop',
      score: loop.strength,
    }));
  }

  private generatePatternInsights(patterns: Array<{ pattern: string; description: string; confidence: number }>): Array<{ text: string; category: string; score: number }> {
    return patterns.map(p => ({
      text: p.description,
      category: 'behavior_pattern',
      score: p.confidence,
    }));
  }

  private generateSummary(
    correlations: Correlation[],
    loops: BehavioralLoop[],
    patterns: Array<{ pattern: string; description: string; confidence: number }>,
    memories: MemoryData[]
  ): string {
    let summary = `Analysis of ${memories.length} memories revealed `;
    
    if (correlations.length > 0) {
      summary += `${correlations.length} significant correlation${correlations.length > 1 ? 's' : ''}, `;
    }
    
    if (loops.length > 0) {
      summary += `${loops.length} behavioral loop${loops.length > 1 ? 's' : ''}, `;
    }
    
    summary += `and ${patterns.length} behavior pattern${patterns.length > 1 ? 's' : ''}. `;
    
    if (loops.length > 0) {
      const strongestLoop = loops[0];
      summary += `Your strongest pattern is a ${strongestLoop.frequency}-day cycle.`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate insight analytics.',
    };
  }
}

export const insightEngineModule = new InsightEngineModule();
