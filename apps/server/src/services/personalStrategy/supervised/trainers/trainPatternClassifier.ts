import { logger } from '../../../../logger';
import { PatternClassifier } from '../models/patternClassifier';
import type { ModelMetadata } from '../types';

/**
 * Trainer for Pattern Classifier
 */
export class PatternClassifierTrainer {
  private classifier: PatternClassifier;

  constructor() {
    this.classifier = new PatternClassifier();
  }

  /**
   * Train pattern classifier for user
   */
  async train(userId: string): Promise<{
    success: boolean;
    accuracy: number;
    metadata?: ModelMetadata;
    error?: string;
  }> {
    try {
      logger.info({ userId }, 'Starting pattern classifier training');

      const result = await this.classifier.train(userId);

      if (result.accuracy === 0) {
        return {
          success: false,
          accuracy: 0,
          error: 'Insufficient training data',
        };
      }

      logger.info(
        { userId, accuracy: result.accuracy },
        'Pattern classifier training completed'
      );

      return {
        success: true,
        accuracy: result.accuracy,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Pattern classifier training failed');
      return {
        success: false,
        accuracy: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get training status
   */
  async getTrainingStatus(userId: string): Promise<{
    trained: boolean;
    accuracy?: number;
    last_trained?: string;
  }> {
    try {
      const { supabaseAdmin } = await import('../../../supabaseClient');
      const { data } = await supabaseAdmin
        .from('ml_models')
        .select('metadata, updated_at')
        .eq('user_id', userId)
        .eq('model_type', 'pattern_classifier')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.metadata) {
        return {
          trained: true,
          accuracy: (data.metadata as any).accuracy,
          last_trained: data.updated_at,
        };
      }

      return { trained: false };
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to get training status');
      return { trained: false };
    }
  }
}
