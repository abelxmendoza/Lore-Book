import { logger } from '../../logger';
import type { AspirationSignal } from './types';

/**
 * Captures more emotional desire-based statements
 */
export class AspirationExtractor {
  /**
   * Extract aspiration signals from entries
   */
  extract(entries: any[]): AspirationSignal[] {
    const aspirations: AspirationSignal[] = [];

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Aspiration markers (more emotional, less concrete)
        const aspirationPatterns = [
          /i hope/i,
          /someday/i,
          /i wish/i,
          /i'd love to/i,
          /i dream of/i,
          /maybe one day/i,
          /if only/i,
          /i would love/i,
          /i'd like to/i,
          /one day i/i,
          /in the future/i,
          /eventually/i,
          /someday i hope/i,
        ];

        // Check for aspiration patterns
        const hasAspirationMarker = aspirationPatterns.some(pattern => pattern.test(contentLower));

        if (hasAspirationMarker) {
          // Calculate confidence based on how certain the statement sounds
          const confidence = this.estimateConfidence(content);

          aspirations.push({
            id: `aspiration_${entry.id}_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            statement: content.substring(0, 500),
            polarity: sentiment,
            confidence,
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
              sentiment,
            },
          });
        }
      }

      logger.debug({ aspirations: aspirations.length, entries: entries.length }, 'Extracted aspiration signals');

      return aspirations;
    } catch (error) {
      logger.error({ error }, 'Failed to extract aspiration signals');
      return [];
    }
  }

  /**
   * Estimate confidence in aspiration statement
   */
  private estimateConfidence(text: string): number {
    const textLower = text.toLowerCase();

    // Higher confidence indicators
    const highConfidenceMarkers = [
      'i will', "i'm going to", 'i plan to', 'definitely', 'for sure', 'absolutely',
      'i know', 'i'm certain', 'i'm sure',
    ];
    const highConfidenceCount = highConfidenceMarkers.filter(m => textLower.includes(m)).length;

    // Lower confidence indicators
    const lowConfidenceMarkers = [
      'maybe', 'perhaps', 'possibly', 'might', 'could', 'if', 'wish', 'hope',
      'someday', 'one day', 'eventually',
    ];
    const lowConfidenceCount = lowConfidenceMarkers.filter(m => textLower.includes(m)).length;

    // Base confidence
    let confidence = 0.6; // Default for aspirations (they're less certain than dreams)

    // Adjust based on markers
    if (highConfidenceCount > 0) {
      confidence = Math.min(1, confidence + highConfidenceCount * 0.1);
    }
    if (lowConfidenceCount > 0) {
      confidence = Math.max(0.3, confidence - lowConfidenceCount * 0.1);
    }

    return confidence;
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'hope', 'wish', 'dream', 'love', 'want', 'desire', 'excited', 'passionate',
      'amazing', 'wonderful', 'great', 'perfect', 'ideal', 'fantastic', 'beautiful',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'doubt', 'uncertain', 'unsure', 'worried', 'anxious', 'fear', 'scared',
      'impossible', 'never', "can't", "won't", 'difficult', 'unlikely',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0.2; // Default slightly positive for aspirations
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

