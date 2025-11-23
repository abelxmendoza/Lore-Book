import { logger } from '../../logger';
import type { EmotionSignal, EmotionType } from './types';

/**
 * Extracts emotional states from journal entries
 */
export class EmotionExtractor {
  /**
   * Extract emotion signals from entries
   */
  extract(entries: any[]): EmotionSignal[] {
    const signals: EmotionSignal[] = [];

    try {
      const patterns: Array<{ emotion: EmotionType; regex: RegExp; weight: number }> = [
        { emotion: 'anger', regex: /(mad|angry|pissed|irritated|heated|furious|rage|annoyed|frustrated)/i, weight: 0.85 },
        { emotion: 'fear', regex: /(scared|afraid|worried|anxious|panicking|terrified|frightened|nervous|panic)/i, weight: 0.9 },
        { emotion: 'sadness', regex: /(sad|down|depressed|crying|empty|melancholy|sorrow|grief|unhappy|blue)/i, weight: 0.9 },
        { emotion: 'joy', regex: /(happy|excited|grateful|love|thrilled|elated|ecstatic|delighted|joyful|bliss)/i, weight: 0.75 },
        { emotion: 'stress', regex: /(stressed|overwhelmed|too much|burnt out|pressure|tension|strain)/i, weight: 0.9 },
        { emotion: 'surprise', regex: /(shocked|unexpected|didn't expect|surprised|amazed|astonished|startled)/i, weight: 0.7 },
        { emotion: 'shame', regex: /(ashamed|embarrassed|humiliated|guilty|disgraced|mortified)/i, weight: 0.9 },
        { emotion: 'guilt', regex: /(regret|felt guilty|i messed up|i should have|i wish i hadn't|remorse)/i, weight: 0.85 },
        { emotion: 'calm', regex: /(peaceful|relaxed|content|grounded|serene|tranquil|at ease|centered)/i, weight: 0.6 },
        { emotion: 'anxiety', regex: /(anxious|worried|uneasy|nervous|apprehensive|restless|on edge)/i, weight: 0.85 },
        { emotion: 'excitement', regex: /(excited|thrilled|pumped|energized|enthusiastic|eager|stoked)/i, weight: 0.7 },
        { emotion: 'love', regex: /(love|adore|cherish|affection|fond|devoted|caring)/i, weight: 0.75 },
        { emotion: 'gratitude', regex: /(grateful|thankful|appreciate|blessed|lucky|fortunate)/i, weight: 0.7 },
        { emotion: 'pride', regex: /(proud|accomplished|achieved|satisfied|fulfilled|successful)/i, weight: 0.7 },
        { emotion: 'envy', regex: /(jealous|envious|resentful|bitter|covet|wish i had)/i, weight: 0.8 },
        { emotion: 'disgust', regex: /(disgusted|revolted|sickened|repulsed|appalled)/i, weight: 0.8 },
        { emotion: 'contempt', regex: /(contempt|disdain|scorn|disrespect|look down on)/i, weight: 0.75 },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Check for emotion patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(content)) {
            // Calculate intensity: base sentiment + emotion indicator boost
            const baseIntensity = Math.max(0, (sentiment + 1) / 2); // Normalize -1 to +1 into 0 to 1
            const intensity = Math.min(1, baseIntensity + 0.3); // Boost for emotion indicators

            signals.push({
              id: `emotion_${entry.id}_${pattern.emotion}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              emotion: pattern.emotion,
              intensity,
              evidence: content.substring(0, 500),
              weight: pattern.weight,
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted emotion signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract emotion signals');
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
      'pleased', 'satisfied', 'content', 'joy', 'thrilled', 'elated', 'delighted',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed',
      'hurt', 'pain', 'exhausted', 'tired', 'overwhelmed', 'hopeless', 'empty', 'regret',
      'fear', 'scared', 'afraid', 'guilt', 'shame', 'embarrassed',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

