import { logger } from '../../logger';
import type { BeliefSignal } from './types';

/**
 * Extracts belief statements (explicit or implicit) from journal entries
 */
export class BeliefExtractor {
  /**
   * Extract belief signals from entries
   */
  extract(entries: any[]): BeliefSignal[] {
    const beliefs: BeliefSignal[] = [];

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Explicit belief markers
        const explicitPatterns = [
          /i believe/i,
          /i think/i,
          /i know/i,
          /i feel that/i,
          /my belief/i,
          /i'm convinced/i,
          /i'm sure/i,
          /i trust that/i,
          /i'm certain/i,
          /i hold that/i,
        ];

        // Check for explicit beliefs
        const hasExplicitMarker = explicitPatterns.some(pattern => pattern.test(content));

        if (hasExplicitMarker) {
          beliefs.push({
            id: `belief_${entry.id}_explicit_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            statement: content.substring(0, 500),
            polarity: sentiment,
            confidence: 0.8,
            entry_id: entry.id,
            is_explicit: true,
            metadata: {
              source_entry_id: entry.id,
              sentiment,
            },
          });
        }

        // Implicit belief markers (generalizations, absolutes, assumptions)
        const implicitPatterns = [
          /always/i,
          /never/i,
          /people (are|do|will|can't)/i,
          /women (are|do|will|can't)/i,
          /men (are|do|will|can't)/i,
          /friends (are|do|will|can't)/i,
          /life is/i,
          /that's how/i,
          /that's just/i,
          /it's (always|never|just)/i,
          /everyone/i,
          /nobody/i,
          /no one/i,
          /everybody/i,
          /the way things are/i,
          /that's the way/i,
        ];

        // Check for implicit beliefs (but not if already captured as explicit)
        if (!hasExplicitMarker) {
          const hasImplicitMarker = implicitPatterns.some(pattern => pattern.test(content));

          if (hasImplicitMarker) {
            beliefs.push({
              id: `belief_${entry.id}_implicit_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              statement: content.substring(0, 500),
              polarity: sentiment,
              confidence: 0.6, // Lower confidence for implicit beliefs
              entry_id: entry.id,
              is_explicit: false,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }
      }

      logger.debug({ beliefs: beliefs.length, entries: entries.length }, 'Extracted belief signals');

      return beliefs;
    } catch (error) {
      logger.error({ error }, 'Failed to extract belief signals');
      return [];
    }
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun',
      'good', 'better', 'best', 'proud', 'grateful', 'thankful', 'blessed', 'lucky',
      'pleased', 'satisfied', 'content', 'positive', 'optimistic', 'hopeful',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed',
      'hurt', 'pain', 'exhausted', 'tired', 'overwhelmed', 'hopeless', 'empty', 'regret',
      'negative', 'pessimistic', 'cynical', 'bitter',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

