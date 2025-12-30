import { logger } from '../../logger';
import type { EmotionType, EmotionalEvent } from './types';

/**
 * Extracts emotional signals from text
 */
export function extractEmotionalSignals(text: string): EmotionalEvent[] {
  const events: EmotionalEvent[] = [];

  try {
    const emotionPatterns: Array<{ emotion: EmotionType; regex: RegExp }> = [
      { emotion: 'anger', regex: /(angry|mad|pissed|furious|rage|irritated|annoyed|heated)/i },
      { emotion: 'fear', regex: /(scared|afraid|terrified|anxious|worried|paranoid|nervous)/i },
      { emotion: 'sadness', regex: /(sad|depressed|down|hurt|heartbroken|melancholy|upset|gloomy)/i },
      { emotion: 'shame', regex: /(ashamed|embarrassed|humiliated|shame|disgrace)/i },
      { emotion: 'guilt', regex: /(guilty|regret|remorse|blame myself|i messed up)/i },
      { emotion: 'joy', regex: /(happy|excited|pumped|elated|thrilled|ecstatic|joyful)/i },
      { emotion: 'pride', regex: /(proud|accomplished|achieved|successful|confident)/i },
      { emotion: 'love', regex: /(love|adore|cherish|affection|fond|care deeply)/i },
      { emotion: 'disgust', regex: /(disgusted|grossed out|repulsed|revolted|sickened)/i },
      { emotion: 'surprise', regex: /(surprised|shocked|amazed|astonished|caught off guard)/i },
      { emotion: 'anxiety', regex: /(anxious|worried|stressed|overwhelmed|panicked|tense)/i },
    ];

    // Detect emotions
    for (const pattern of emotionPatterns) {
      if (pattern.regex.test(text)) {
        // Calculate intensity based on modifiers
        let intensity = 5; // default

        // Strong intensity indicators
        const strongWords = (text.match(/\b(extremely|incredibly|intensely|deeply|profoundly|overwhelmingly|completely|totally)\b/gi) || []).length;
        if (strongWords > 0) {
          intensity = Math.min(10, 7 + strongWords);
        }

        // Weak intensity indicators
        const weakWords = (text.match(/\b(slightly|a bit|somewhat|kind of|sort of)\b/gi) || []).length;
        if (weakWords > 0 && strongWords === 0) {
          intensity = Math.max(1, 3 - weakWords);
        }

        // Exclamation marks increase intensity
        const exclamations = (text.match(/!/g) || []).length;
        intensity = Math.min(10, intensity + Math.min(2, exclamations));

        events.push({
          emotion: pattern.emotion,
          intensity: Math.max(1, Math.min(10, intensity)),
        });
      }
    }

    logger.debug({ count: events.length }, 'Extracted emotional signals');
  } catch (error) {
    logger.error({ error }, 'Error extracting emotional signals');
  }

  return events;
}

