import { logger } from '../../logger';
import type { NormalizedBehavior } from './types';

/**
 * Normalizes behavior signals (V1: rule-based, future: LLM)
 */
export class BehaviorNormalizer {
  private readonly polarityMap: Record<string, 'positive' | 'negative' | 'neutral'> = {
    drinking: 'negative',
    flirting: 'neutral',
    sparring: 'positive',
    avoidance: 'negative',
    overthinking: 'negative',
    impulse: 'negative',
    grinding: 'positive',
    'self-criticism': 'negative',
    socializing: 'positive',
    exercise: 'positive',
    gaming: 'neutral',
    shopping: 'neutral',
  };

  private readonly subtypeMap: Record<string, string> = {
    drinking: 'alcohol',
    flirting: 'social',
    sparring: 'combat',
    avoidance: 'procrastination',
    overthinking: 'anxiety',
    impulse: 'decision',
    grinding: 'work',
    'self-criticism': 'negative_self_talk',
    socializing: 'friends',
    exercise: 'fitness',
    gaming: 'entertainment',
    shopping: 'retail',
  };

  /**
   * Normalize a behavior signal
   * V1: Rule-based normalization
   * Future: LLM-based refinement
   */
  async normalize(
    text: string,
    rawBehavior: string
  ): Promise<{
    behavior: string;
    subtype?: string;
    polarity: 'positive' | 'negative' | 'neutral';
    triggers?: string[];
    consequences?: string[];
  }> {
    try {
      const behavior = rawBehavior.toLowerCase();
      const polarity = this.polarityMap[behavior] || 'neutral';
      const subtype = this.subtypeMap[behavior];

      // Simple trigger/consequence detection (V1)
      const triggers: string[] = [];
      const consequences: string[] = [];

      // Detect common triggers
      if (text.match(/(lonely|bored|stressed|tired|frustrated)/i)) {
        triggers.push('emotional_state');
      }
      if (text.match(/(after work|weekend|night|evening)/i)) {
        triggers.push('time_context');
      }
      if (text.match(/(friend|someone|they|person)/i)) {
        triggers.push('social_pressure');
      }

      // Detect common consequences
      if (text.match(/(regret|shame|guilt|disappointed)/i)) {
        consequences.push('negative_emotion');
      }
      if (text.match(/(felt good|enjoyed|happy|satisfied)/i)) {
        consequences.push('positive_emotion');
      }
      if (text.match(/(tired|exhausted|drained)/i)) {
        consequences.push('fatigue');
      }

      return {
        behavior,
        subtype,
        polarity,
        triggers: triggers.length > 0 ? triggers : undefined,
        consequences: consequences.length > 0 ? consequences : undefined,
      };
    } catch (error) {
      logger.error({ error, text, rawBehavior }, 'Error normalizing behavior');
      return {
        behavior: rawBehavior.toLowerCase(),
        polarity: 'neutral',
      };
    }
  }
}

