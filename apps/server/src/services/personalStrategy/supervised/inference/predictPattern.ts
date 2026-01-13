import { logger } from '../../../logger';
import { PatternClassifier } from '../models/patternClassifier';
import type { PatternPrediction, PatternType } from '../types';

/**
 * Inference service for pattern prediction
 */
export class PatternPredictor {
  private classifier: PatternClassifier;

  constructor() {
    this.classifier = new PatternClassifier();
  }

  /**
   * Predict pattern for entry
   */
  async predict(
    userId: string,
    entryText: string,
    stateFeatures?: Record<string, number>
  ): Promise<PatternPrediction> {
    try {
      return await this.classifier.predict(userId, entryText, stateFeatures);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict pattern');
      // Return default
      return {
        pattern: 'maintenance',
        confidence: 0.5,
        probabilities: {
          growth: 0.2,
          maintenance: 0.3,
          recovery: 0.15,
          avoidance_spiral: 0.1,
          burnout_risk: 0.1,
          stagnation: 0.15,
        },
      };
    }
  }

  /**
   * Batch predict patterns for multiple entries
   */
  async predictBatch(
    userId: string,
    entries: Array<{ id: string; text: string; stateFeatures?: Record<string, number> }>
  ): Promise<Map<string, PatternPrediction>> {
    const predictions = new Map<string, PatternPrediction>();

    for (const entry of entries) {
      const prediction = await this.predict(userId, entry.text, entry.stateFeatures);
      predictions.set(entry.id, prediction);
    }

    return predictions;
  }
}
