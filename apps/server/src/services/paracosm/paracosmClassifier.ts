import { logger } from '../../logger';
import type { ParacosmElement } from './paracosmTypes';

/**
 * Classifies paracosm elements (V1: rule-based, future: Python integration)
 */
export class ParacosmClassifier {
  /**
   * Classify paracosm elements
   * V1: Rule-based classification refinement
   * Future: Python-based classification for more sophisticated analysis
   */
  async classify(elements: ParacosmElement[]): Promise<ParacosmElement[]> {
    if (elements.length === 0) return elements;

    try {
      // Refine classifications based on context
      return elements.map((element) => {
        const text = element.text.toLowerCase();

        // Refine confidence based on context
        let confidence = element.confidence;

        // Higher confidence for explicit markers
        if (text.match(/(i imagine|i pictured|in my head|mental|fantasy)/i)) {
          confidence = Math.min(1, confidence + 0.1);
        }

        // Lower confidence for ambiguous cases
        if (text.match(/(maybe|perhaps|might|could be)/i)) {
          confidence = Math.max(0.3, confidence - 0.2);
        }

        // Adjust vividness based on descriptive words
        const descriptiveWords = (text.match(/\b(detailed|vivid|clear|vibrant|rich|elaborate)\b/gi) || []).length;
        const vividness = Math.min(1, element.vividness + descriptiveWords * 0.1);

        // Adjust emotional intensity
        const strongEmotions = (text.match(/\b(intense|overwhelming|powerful|deep|strong)\b/gi) || []).length;
        const emotional_intensity = Math.min(1, element.emotional_intensity + strongEmotions * 0.1);

        return {
          ...element,
          confidence,
          vividness,
          emotional_intensity,
        };
      });
    } catch (error) {
      logger.error({ error }, 'Error classifying paracosm elements');
      return elements;
    }
  }
}

