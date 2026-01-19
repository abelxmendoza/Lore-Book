import { logger } from '../../logger';

import type { RawEmotionSignal } from './types';

/**
 * Extracts raw emotion signals from journal entries
 */
export class EmotionExtractor {
  private readonly patterns = [
    { emotion: 'anger', regex: /(mad|angry|pissed|heated|rage|annoyed|frustrated|irritated|furious)/i },
    { emotion: 'sadness', regex: /(sad|down|depressed|gloomy|hurt|heartbroken|melancholy|upset)/i },
    { emotion: 'fear', regex: /(scared|anxious|worried|paranoid|nervous|afraid|terrified)/i },
    { emotion: 'joy', regex: /(happy|excited|pumped|grateful|proud|elated|thrilled|ecstatic)/i },
    { emotion: 'disgust', regex: /(grossed out|disgusted|repulsed|revolted)/i },
    { emotion: 'surprise', regex: /(shocked|surprised|caught off guard|amazed|astonished)/i },
    { emotion: 'desire', regex: /(want|craving|longing|obsessed|yearning|wish)/i },
    { emotion: 'confidence', regex: /(confident|capable|strong|focused|dialed in|determined)/i },
    { emotion: 'love', regex: /(love|adore|cherish|affection|fond)/i },
    { emotion: 'shame', regex: /(ashamed|embarrassed|humiliated|guilty)/i },
    { emotion: 'envy', regex: /(jealous|envious|resentful)/i },
    { emotion: 'relief', regex: /(relieved|calm|peaceful|at ease)/i },
  ];

  /**
   * Extract emotion signals from entries
   */
  extract(entries: any[]): RawEmotionSignal[] {
    const signals: RawEmotionSignal[] = [];

    try {
      for (const entry of entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        const timestamp = entry.date || entry.created_at || entry.timestamp;

        // Check each emotion pattern
        for (const pattern of this.patterns) {
          if (pattern.regex.test(text)) {
            signals.push({
              memoryId: entry.id,
              text,
              timestamp,
            });
            // Only match first emotion per entry to avoid duplicates
            break;
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
}

