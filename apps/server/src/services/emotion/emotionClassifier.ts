import { logger } from '../../logger';
import type { EmotionClassification } from './types';

/**
 * Classifies emotions from text
 * V1: Rule-based classification (no LLM for cost optimization)
 */
export class EmotionClassifier {
  /**
   * Classify emotion from text
   */
  async classify(text: string): Promise<EmotionClassification> {
    try {
      const textLower = text.toLowerCase();

      // Determine primary emotion
      const emotionMap: Record<string, { emotion: string; subtype: string | null; polarity: 'positive' | 'negative' | 'neutral' }> = {
        anger: { emotion: 'anger', subtype: this.getAngerSubtype(textLower), polarity: 'negative' },
        sadness: { emotion: 'sadness', subtype: this.getSadnessSubtype(textLower), polarity: 'negative' },
        fear: { emotion: 'fear', subtype: this.getFearSubtype(textLower), polarity: 'negative' },
        joy: { emotion: 'joy', subtype: this.getJoySubtype(textLower), polarity: 'positive' },
        disgust: { emotion: 'disgust', subtype: null, polarity: 'negative' },
        surprise: { emotion: 'surprise', subtype: this.getSurpriseSubtype(textLower), polarity: 'neutral' },
        desire: { emotion: 'desire', subtype: null, polarity: 'neutral' },
        confidence: { emotion: 'confidence', subtype: null, polarity: 'positive' },
        love: { emotion: 'love', subtype: null, polarity: 'positive' },
        shame: { emotion: 'shame', subtype: null, polarity: 'negative' },
        envy: { emotion: 'envy', subtype: null, polarity: 'negative' },
        relief: { emotion: 'relief', subtype: null, polarity: 'positive' },
      };

      // Find matching emotion
      for (const [key, value] of Object.entries(emotionMap)) {
        const patterns = this.getEmotionPatterns(key);
        if (patterns.some(p => p.test(textLower))) {
          return {
            emotion: value.emotion,
            subtype: value.subtype,
            polarity: value.polarity,
          };
        }
      }

      // Default to neutral if no match
      return {
        emotion: 'neutral',
        subtype: null,
        polarity: 'neutral',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to classify emotion');
      return {
        emotion: 'neutral',
        subtype: null,
        polarity: 'neutral',
      };
    }
  }

  /**
   * Get emotion patterns
   */
  private getEmotionPatterns(emotion: string): RegExp[] {
    const patterns: Record<string, RegExp[]> = {
      anger: [/(mad|angry|pissed|heated|rage|annoyed|frustrated|irritated|furious)/i],
      sadness: [/(sad|down|depressed|gloomy|hurt|heartbroken|melancholy|upset)/i],
      fear: [/(scared|anxious|worried|paranoid|nervous|afraid|terrified)/i],
      joy: [/(happy|excited|pumped|grateful|proud|elated|thrilled|ecstatic)/i],
      disgust: [/(grossed out|disgusted|repulsed|revolted)/i],
      surprise: [/(shocked|surprised|caught off guard|amazed|astonished)/i],
      desire: [/(want|craving|longing|obsessed|yearning|wish)/i],
      confidence: [/(confident|capable|strong|focused|dialed in|determined)/i],
      love: [/(love|adore|cherish|affection|fond)/i],
      shame: [/(ashamed|embarrassed|humiliated|guilty)/i],
      envy: [/(jealous|envious|resentful)/i],
      relief: [/(relieved|calm|peaceful|at ease)/i],
    };

    return patterns[emotion] || [];
  }

  /**
   * Get anger subtype
   */
  private getAngerSubtype(text: string): string | null {
    if (text.includes('frustrated') || text.includes('frustration')) return 'frustration';
    if (text.includes('irritated') || text.includes('irritation')) return 'irritation';
    if (text.includes('rage') || text.includes('furious')) return 'rage';
    return 'anger';
  }

  /**
   * Get sadness subtype
   */
  private getSadnessSubtype(text: string): string | null {
    if (text.includes('depressed') || text.includes('depression')) return 'depression';
    if (text.includes('heartbroken') || text.includes('heartbreak')) return 'heartbreak';
    if (text.includes('melancholy')) return 'melancholy';
    return 'sadness';
  }

  /**
   * Get fear subtype
   */
  private getFearSubtype(text: string): string | null {
    if (text.includes('anxious') || text.includes('anxiety')) return 'anxiety';
    if (text.includes('worried') || text.includes('worry')) return 'worry';
    if (text.includes('paranoid') || text.includes('paranoia')) return 'paranoia';
    return 'fear';
  }

  /**
   * Get joy subtype
   */
  private getJoySubtype(text: string): string | null {
    if (text.includes('excited') || text.includes('excitement')) return 'excitement';
    if (text.includes('grateful') || text.includes('gratitude')) return 'gratitude';
    if (text.includes('proud') || text.includes('pride')) return 'pride';
    return 'joy';
  }

  /**
   * Get surprise subtype
   */
  private getSurpriseSubtype(text: string): string | null {
    if (text.includes('shocked') || text.includes('shock')) return 'shock';
    if (text.includes('amazed') || text.includes('amazement')) return 'amazement';
    return 'surprise';
  }
}

