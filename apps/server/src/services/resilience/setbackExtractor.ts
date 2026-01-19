import { logger } from '../../logger';

import type { SetbackSignal, ResilienceContext, SetbackType } from './types';

/**
 * Extracts setback signals from journal entries
 * Detects emotional/physical/social downturns
 */
export class SetbackExtractor {
  /**
   * Extract setback signals from context
   */
  extract(ctx: ResilienceContext): SetbackSignal[] {
    const signals: SetbackSignal[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Setback type patterns
        const patterns: Array<{ type: SetbackType; regex: RegExp }> = [
          { type: 'emotional', regex: /(anxious|depressed|burnt out|i feel empty|overwhelmed|stressed|exhausted|drained|numb|hopeless)/ },
          { type: 'physical', regex: /(hurt|injury|injured|exhausted|sick|pain|ache|tired|fatigue|illness)/ },
          { type: 'social', regex: /(ignored|left out|excluded|embarrassed|humiliated|rejected|lonely|isolated)/ },
          { type: 'career', regex: /(rejected|laid off|fired|failed interview|mistake|error|criticized|performance issue)/ },
          { type: 'relationship', regex: /(heartbroken|fight|argued|breakup|divorce|conflict|betrayed|abandoned)/ },
          { type: 'identity', regex: /(lost|don't know who i am|regret|shame|guilt|identity crisis|confused about myself)/ },
        ];

        // Check for setback patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Calculate severity: inverted sentiment (negative sentiment = higher severity)
            const severity = Math.max(0, Math.min(1, (sentiment < 0 ? Math.abs(sentiment) : 0.3) + 0.2));

            signals.push({
              id: `setback_${entry.id}_${pattern.type}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              type: pattern.type,
              severity,
              text: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted setback signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract setback signals');
      return [];
    }
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Negative indicators
    const negativeMarkers = [
      'anxious', 'depressed', 'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried',
      'hurt', 'pain', 'exhausted', 'tired', 'stressed', 'overwhelmed', 'hopeless', 'empty',
      'rejected', 'ignored', 'left out', 'embarrassed', 'humiliated', 'heartbroken', 'regret',
      'shame', 'guilt', 'failed', 'mistake', 'error', 'criticized', 'fired', 'laid off',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun',
      'good', 'better', 'best', 'proud', 'grateful', 'thankful', 'blessed', 'lucky',
      'pleased', 'satisfied', 'content', 'relieved', 'calm', 'peaceful',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (negativeCount === 0 && positiveCount === 0) return 0;
    const total = negativeCount + positiveCount;
    return (positiveCount - negativeCount) / total;
  }
}

