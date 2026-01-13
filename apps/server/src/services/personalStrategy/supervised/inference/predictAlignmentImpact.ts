import { logger } from '../../../logger';
import { AlignmentRegressor } from '../models/alignmentRegressor';
import type { AlignmentImpactPrediction } from '../types';
import type { RLStateVector, ActionType } from '../../types';

/**
 * Inference service for alignment impact prediction
 */
export class AlignmentImpactPredictor {
  private regressor: AlignmentRegressor;

  constructor() {
    this.regressor = new AlignmentRegressor();
  }

  /**
   * Predict alignment impact for state-action pair
   */
  async predict(
    userId: string,
    state: RLStateVector,
    actionType: ActionType
  ): Promise<AlignmentImpactPrediction> {
    try {
      return await this.regressor.predict(userId, state, actionType);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict alignment impact');
      // Return default
      return {
        alignment_delta: 0,
        confidence: 0.5,
      };
    }
  }

  /**
   * Batch predict alignment impact for multiple actions
   */
  async predictBatch(
    userId: string,
    state: RLStateVector,
    actionTypes: ActionType[]
  ): Promise<Map<ActionType, AlignmentImpactPrediction>> {
    const predictions = new Map<ActionType, AlignmentImpactPrediction>();

    for (const actionType of actionTypes) {
      const prediction = await this.predict(userId, state, actionType);
      predictions.set(actionType, prediction);
    }

    return predictions;
  }

  /**
   * Filter actions that would harm alignment
   */
  async filterAlignmentHarmful(
    userId: string,
    state: RLStateVector,
    actions: ActionType[],
    threshold: number = -0.1
  ): Promise<ActionType[]> {
    const predictions = await this.predictBatch(userId, state, actions);

    return actions.filter(action => {
      const prediction = predictions.get(action);
      if (!prediction) return true; // Keep if no prediction

      // Filter out actions that would significantly harm alignment
      return prediction.alignment_delta >= threshold;
    });
  }
}
