import { logger } from '../../../../logger';
import type { RLStateVector, ActionType } from '../../types';
import { OutcomePredictor } from '../models/outcomePredictor';
import type { OutcomePrediction, ActionOutcome } from '../types';

/**
 * Inference service for outcome prediction
 */
export class OutcomePredictorService {
  private predictor: OutcomePredictor;

  constructor() {
    this.predictor = new OutcomePredictor();
  }

  /**
   * Predict outcome for state-action pair
   */
  async predict(
    userId: string,
    state: RLStateVector,
    actionType: ActionType
  ): Promise<OutcomePrediction> {
    try {
      return await this.predictor.predict(userId, state, actionType);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict outcome');
      // Return default
      return {
        outcome: 'neutral',
        confidence: 0.5,
        probabilities: {
          positive: 0.33,
          neutral: 0.34,
          negative: 0.33,
        },
      };
    }
  }

  /**
   * Batch predict outcomes for multiple actions
   */
  async predictBatch(
    userId: string,
    state: RLStateVector,
    actionTypes: ActionType[]
  ): Promise<Map<ActionType, OutcomePrediction>> {
    const predictions = new Map<ActionType, OutcomePrediction>();

    for (const actionType of actionTypes) {
      const prediction = await this.predict(userId, state, actionType);
      predictions.set(actionType, prediction);
    }

    return predictions;
  }

  /**
   * Get best action based on predicted outcomes
   */
  async getBestAction(
    userId: string,
    state: RLStateVector,
    availableActions: ActionType[]
  ): Promise<{ action: ActionType; prediction: OutcomePrediction } | null> {
    if (availableActions.length === 0) return null;

    const predictions = await this.predictBatch(userId, state, availableActions);

    let bestAction: ActionType | null = null;
    let bestScore = -Infinity;

    for (const [action, prediction] of predictions.entries()) {
      // Score = positive probability - negative probability
      const score = prediction.probabilities.positive - prediction.probabilities.negative;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    if (!bestAction) return null;

    return {
      action: bestAction,
      prediction: predictions.get(bestAction)!,
    };
  }
}
