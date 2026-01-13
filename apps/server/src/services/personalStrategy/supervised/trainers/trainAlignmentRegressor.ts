import { logger } from '../../../logger';
import { AlignmentRegressor } from '../models/alignmentRegressor';
import type { ModelMetadata } from '../types';

/**
 * Trainer for Alignment Regressor
 */
export class AlignmentRegressorTrainer {
  private regressor: AlignmentRegressor;

  constructor() {
    this.regressor = new AlignmentRegressor();
  }

  /**
   * Train alignment regressor for user
   */
  async train(userId: string): Promise<{
    success: boolean;
    mse: number;
    metadata?: ModelMetadata;
    error?: string;
  }> {
    try {
      logger.info({ userId }, 'Starting alignment regressor training');

      const result = await this.regressor.train(userId);

      if (result.mse >= 1.0) {
        return {
          success: false,
          mse: result.mse,
          error: 'Insufficient training data',
        };
      }

      logger.info(
        { userId, mse: result.mse },
        'Alignment regressor training completed'
      );

      return {
        success: true,
        mse: result.mse,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Alignment regressor training failed');
      return {
        success: false,
        mse: 1.0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get training status
   */
  async getTrainingStatus(userId: string): Promise<{
    trained: boolean;
    mse?: number;
    last_trained?: string;
  }> {
    try {
      const { supabaseAdmin } = await import('../../../supabaseClient');
      const { data } = await supabaseAdmin
        .from('ml_models')
        .select('metadata, updated_at')
        .eq('user_id', userId)
        .eq('model_type', 'alignment_regressor')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.metadata) {
        return {
          trained: true,
          mse: (data.metadata as any).mse,
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
