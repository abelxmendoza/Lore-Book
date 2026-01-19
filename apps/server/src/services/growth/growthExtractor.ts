import { logger } from '../../logger';

import type { GrowthSignal, GrowthContext, GrowthDomain } from './types';

/**
 * Extracts growth signals from journal entries
 */
export class GrowthExtractor {
  /**
   * Extract growth signals from context
   */
  extract(ctx: GrowthContext): GrowthSignal[] {
    const signals: GrowthSignal[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Domain patterns
        const patterns: Array<{ domain: GrowthDomain; regex: RegExp }> = [
          { domain: 'fitness', regex: /(trained|gym|sparred|rolled|ran|worked out|exercise|workout|fitness|training)/ },
          { domain: 'career', regex: /(interview|coding|learned|built|shipped|promotion|job|work|career|professional)/ },
          { domain: 'mindset', regex: /(realized|learned|breakthrough|lesson|insight|understanding|perspective|mindset)/ },
          { domain: 'relationships', regex: /(talked to|bonded|conflict|connection|friend|relationship|partner|social)/ },
          { domain: 'discipline', regex: /(consistency|streak|woke up early|pushed myself|discipline|routine|habit)/ },
          { domain: 'learning', regex: /(studied|read|learned|practiced|education|course|skill|knowledge)/ },
          { domain: 'creativity', regex: /(created|designed|wrote|art|creative|project|built|made)/ },
          { domain: 'health', regex: /(meditated|yoga|wellness|health|nutrition|diet|sleep|recovery)/ },
          { domain: 'financial', regex: /(saved|invested|budget|money|financial|income|earning)/ },
        ];

        // Check for growth patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            const intensity = this.calculateIntensity(content, sentiment);
            const direction = this.determineDirection(contentLower);

            signals.push({
              id: `growth_${entry.id}_${pattern.domain}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              domain: pattern.domain,
              intensity,
              direction,
              text: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }

        // Regression signals
        if (this.isRegression(contentLower)) {
          const domain = this.determineRegressionDomain(contentLower);
          signals.push({
            id: `growth_${entry.id}_regression_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            domain,
            intensity: 0.6,
            direction: -1,
            text: content.substring(0, 500),
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
              sentiment,
              is_regression: true,
            },
          });
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted growth signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract growth signals');
      return [];
    }
  }

  /**
   * Calculate intensity of growth signal
   */
  private calculateIntensity(text: string, sentiment: number): number {
    const textLower = text.toLowerCase();

    // Base intensity from sentiment
    let intensity = Math.max(0, (sentiment + 1) / 2); // Normalize -1 to +1 to 0 to 1

    // Boost for strong growth indicators
    const strongIndicators = [
      'breakthrough',
      'level up',
      'major',
      'significant',
      'huge',
      'massive',
      'achieved',
      'accomplished',
      'mastered',
      'exceeded',
      'surpassed',
    ];

    if (strongIndicators.some(indicator => textLower.includes(indicator))) {
      intensity = Math.min(1, intensity + 0.3);
    }

    // Boost for consistency indicators
    const consistencyIndicators = [
      'consistently',
      'every day',
      'daily',
      'streak',
      'routine',
      'habit',
    ];

    if (consistencyIndicators.some(indicator => textLower.includes(indicator))) {
      intensity = Math.min(1, intensity + 0.2);
    }

    return Math.max(0, Math.min(1, intensity));
  }

  /**
   * Determine direction of growth
   */
  private determineDirection(textLower: string): 1 | -1 {
    // Negative indicators
    const negativeIndicators = [
      'fell off',
      'lost progress',
      'regressed',
      'declined',
      'worse',
      'struggling',
      'failed',
      'gave up',
    ];

    if (negativeIndicators.some(indicator => textLower.includes(indicator))) {
      return -1;
    }

    return 1;
  }

  /**
   * Check if text indicates regression
   */
  private isRegression(textLower: string): boolean {
    const regressionMarkers = [
      'fell off',
      'lost progress',
      'regressed',
      'declined',
      'backsliding',
      'lost momentum',
      'stopped',
      'quit',
      'gave up',
    ];

    return regressionMarkers.some(marker => textLower.includes(marker));
  }

  /**
   * Determine domain for regression
   */
  private determineRegressionDomain(textLower: string): GrowthDomain {
    if (textLower.includes('gym') || textLower.includes('workout') || textLower.includes('exercise')) {
      return 'fitness';
    }
    if (textLower.includes('study') || textLower.includes('learn') || textLower.includes('practice')) {
      return 'learning';
    }
    if (textLower.includes('routine') || textLower.includes('habit') || textLower.includes('consistency')) {
      return 'discipline';
    }
    if (textLower.includes('work') || textLower.includes('career') || textLower.includes('job')) {
      return 'career';
    }

    return 'discipline'; // Default to discipline
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun', 'good', 'better', 'best',
      'proud', 'grateful', 'thankful', 'blessed', 'lucky', 'pleased', 'satisfied', 'content',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed', 'tired', 'exhausted',
      'bad', 'worse', 'worst', 'hate', 'regret', 'guilty', 'ashamed', 'embarrassed', 'hurt', 'pain',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

