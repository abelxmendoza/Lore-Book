import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { RLEngine, type RLContext } from '../reinforcementLearning/rlEngine';
import { RewardEngine } from './rewardEngine';
import { StateEncoder } from './stateEncoder';
import { ActionSpace } from './actionSpace';
import { OutcomePredictorService } from './supervised/inference/predictOutcome';
import { AlignmentImpactPredictor } from './supervised/inference/predictAlignmentImpact';
import type { Action, ActionType, ActionRecommendation, RLStateVector } from './types';

export class DecisionRL {
  private rlEngine: RLEngine;
  private rewardEngine: RewardEngine;
  private stateEncoder: StateEncoder;
  private actionSpace: ActionSpace;
  private outcomePredictor: OutcomePredictorService;
  private alignmentPredictor: AlignmentImpactPredictor;

  constructor() {
    this.rlEngine = new RLEngine();
    this.rewardEngine = new RewardEngine();
    this.stateEncoder = new StateEncoder();
    this.actionSpace = new ActionSpace();
    this.outcomePredictor = new OutcomePredictorService();
    this.alignmentPredictor = new AlignmentImpactPredictor();
  }

  /**
   * Recommend action based on current state
   * Enhanced with supervised learning predictions
   */
  async recommendAction(userId: string): Promise<ActionRecommendation> {
    try {
      // 1. Encode current state
      const state = await this.stateEncoder.encodeCurrentState(userId);

      // 2. Get available actions
      const availableActions = await this.actionSpace.getAvailableActions(userId, state);

      if (availableActions.length === 0) {
        return {
          recommended_action: 'rest',
          confidence: 0.5,
          reason: 'No actions available given current state',
          alternatives: [],
        };
      }

      // 3. Use supervised learning to filter/rank actions
      const actionTypes = availableActions.map(a => a.type);
      
      // Predict outcomes for all actions
      const outcomePredictions = await this.outcomePredictor.predictBatch(userId, state, actionTypes);
      
      // Predict alignment impact for all actions
      const alignmentPredictions = await this.alignmentPredictor.predictBatch(userId, state, actionTypes);

      // Filter out actions that would significantly harm alignment
      const alignmentSafeActions = await this.alignmentPredictor.filterAlignmentHarmful(
        userId,
        state,
        actionTypes,
        -0.15 // Threshold: allow small negative impact
      );

      // Filter available actions to only alignment-safe ones
      const safeActions = availableActions.filter(a => alignmentSafeActions.includes(a.type));

      // 4. Use RL to select best action from safe actions
      const context: RLContext = {
        type: 'action_recommendation',
        features: await this.stateEncoder.extractFeatures(state),
      };

      const rlActions = safeActions.length > 0 ? safeActions : availableActions;
      const selectedAction = await this.rlEngine.selectAction(
        userId,
        context,
        rlActions.map(a => ({ id: a.type, type: 'action' }))
      );

      // 5. Get supervised learning predictions for selected action
      const outcomePrediction = outcomePredictions.get(selectedAction.id as ActionType);
      const alignmentPrediction = alignmentPredictions.get(selectedAction.id as ActionType);

      // 6. Calculate confidence (combine RL policy + supervised predictions)
      const policy = await (this.rlEngine as any).getUserPolicy(userId, context);
      const rlConfidence = policy[selectedAction.id] || 0.5;
      const outcomeConfidence = outcomePrediction?.confidence || 0.5;
      const combinedConfidence = (rlConfidence * 0.6 + outcomeConfidence * 0.4);

      // 7. Get alternatives with scores
      const scoredActions = availableActions.map(action => {
        const outcome = outcomePredictions.get(action.type);
        const alignment = alignmentPredictions.get(action.type);
        const rlScore = policy[action.type] || 0.5;
        const outcomeScore = outcome?.probabilities.positive || 0.33;
        const alignmentScore = alignment ? (alignment.alignment_delta + 1) / 2 : 0.5; // Normalize to 0-1
        
        // Combined score
        const score = (rlScore * 0.4 + outcomeScore * 0.4 + alignmentScore * 0.2);
        
        return { action: action.type, score };
      });

      scoredActions.sort((a, b) => b.score - a.score);

      // 8. Generate reason (enhanced with supervised learning insights)
      const reason = await this.generateReason(
        userId,
        selectedAction.id as ActionType,
        state,
        outcomePrediction,
        alignmentPrediction
      );

      // 9. Save recommendation
      const { data: snapshot } = await supabaseAdmin
        .from('state_snapshots')
        .insert({
          user_id: userId,
          snapshot_data: state,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      const { data: recommendation } = await supabaseAdmin
        .from('action_recommendations')
        .insert({
          user_id: userId,
          recommended_action: selectedAction.id,
          confidence: combinedConfidence,
          reason,
          state_snapshot_id: snapshot?.id,
          alternatives: scoredActions.slice(1, 4),
          status: 'pending',
        })
        .select()
        .single();

      return {
        recommended_action: selectedAction.id as ActionType,
        confidence: combinedConfidence,
        reason,
        alternatives: scoredActions.slice(1, 4),
        state_snapshot_id: recommendation?.id,
        predicted_outcome: outcomePrediction?.outcome,
        predicted_outcome_confidence: outcomePrediction?.confidence,
        predicted_alignment_impact: alignmentPrediction?.alignment_delta,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to recommend action');
      return {
        recommended_action: 'reflect',
        confidence: 0.3,
        reason: 'Unable to generate recommendation - defaulting to reflection',
        alternatives: [],
      };
    }
  }

  /**
   * Record action outcome and update policy
   */
  async recordActionOutcome(
    userId: string,
    action: Action,
    outcome: 'positive' | 'neutral' | 'negative'
  ): Promise<void> {
    try {
      const state = await this.stateEncoder.encodeCurrentState(userId);
      const reward = await this.rewardEngine.evaluateReward(userId, state, action);

      // Adjust reward based on outcome
      let outcomeReward = reward;
      if (outcome === 'positive') {
        outcomeReward += 0.3;
      } else if (outcome === 'negative') {
        outcomeReward -= 0.3;
      }

      // Update RL policy
      const context: RLContext = {
        type: 'action_recommendation',
        features: await this.stateEncoder.extractFeatures(state),
      };

      await this.rlEngine.updatePolicy(
        userId,
        context,
        { id: action.type, type: 'action' },
        outcomeReward
      );

      // Save action to database
      await supabaseAdmin
        .from('strategy_actions')
        .insert({
          user_id: userId,
          action_type: action.type,
          timestamp: action.timestamp,
          duration_minutes: action.duration_minutes,
          intensity: action.intensity,
          context: action.context,
          outcome,
          reward: outcomeReward,
          entry_id: action.context.entry_id,
          metadata: action.metadata,
        });

      logger.debug(
        { userId, action: action.type, outcome, reward: outcomeReward },
        'Recorded action outcome'
      );
    } catch (error) {
      logger.error({ error, userId, action }, 'Failed to record action outcome');
    }
  }

  private async generateReason(
    userId: string,
    action: ActionType,
    state: RLStateVector,
    outcomePrediction?: any,
    alignmentPrediction?: any
  ): Promise<string> {
    const reasons: string[] = [];

    // State-based reasons
    if (state.energy > 0.7 && action === 'train') {
      reasons.push('High energy levels are optimal for training');
    }

    if (state.stress > 0.7 && action === 'rest') {
      reasons.push('High stress detected - rest recommended');
    }

    if (state.goal_progress_score < 0.3 && action === 'code') {
      reasons.push('Goal progress is low - focused work recommended');
    }

    if (state.identity_alignment < 0.5 && action === 'reflect') {
      reasons.push('Identity alignment is low - reflection recommended');
    }

    // Supervised learning insights
    if (outcomePrediction) {
      if (outcomePrediction.outcome === 'positive' && outcomePrediction.confidence > 0.7) {
        reasons.push(`This action typically works well for you (${Math.round(outcomePrediction.confidence * 100)}% confidence)`);
      } else if (outcomePrediction.outcome === 'negative' && outcomePrediction.confidence > 0.6) {
        reasons.push(`Warning: This action has historically led to negative outcomes`);
      }
    }

    if (alignmentPrediction) {
      if (alignmentPrediction.alignment_delta > 0.1) {
        reasons.push(`This action aligns with your values (expected +${Math.round(alignmentPrediction.alignment_delta * 100)}% alignment)`);
      } else if (alignmentPrediction.alignment_delta < -0.1) {
        reasons.push(`Warning: This action may erode your identity alignment`);
      }
    }

    // Historical pattern
    const historicalPattern = await this.getHistoricalPattern(userId, action);
    if (historicalPattern) {
      reasons.push(historicalPattern);
    }

    return reasons.join('. ') || `Recommended based on current state analysis`;
  }

  private async getHistoricalPattern(
    userId: string,
    action: ActionType
  ): Promise<string | null> {
    try {
      const { data: pastActions } = await supabaseAdmin
        .from('strategy_actions')
        .select('outcome, reward')
        .eq('user_id', userId)
        .eq('action_type', action)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (!pastActions || pastActions.length === 0) {
        return null;
      }

      const positiveOutcomes = pastActions.filter(a => 
        a.outcome === 'positive' || (a.reward && a.reward > 0.5)
      ).length;

      const successRate = positiveOutcomes / pastActions.length;

      if (successRate > 0.7) {
        return `Historically, this action has been effective (${Math.round(successRate * 100)}% success rate)`;
      }

      return null;
    } catch (error) {
      logger.debug({ error }, 'Failed to get historical pattern');
      return null;
    }
  }

  /**
   * Get pending recommendations for user
   */
  async getPendingRecommendations(userId: string): Promise<any[]> {
    try {
      const { data } = await supabaseAdmin
        .from('action_recommendations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      return data || [];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get pending recommendations');
      return [];
    }
  }

  /**
   * Mark recommendation as acted upon
   */
  async markRecommendationActed(
    userId: string,
    recommendationId: string,
    outcome: 'positive' | 'neutral' | 'negative'
  ): Promise<void> {
    try {
      const { data: recommendation } = await supabaseAdmin
        .from('action_recommendations')
        .select('*')
        .eq('id', recommendationId)
        .eq('user_id', userId)
        .single();

      if (!recommendation) {
        throw new Error('Recommendation not found');
      }

      await supabaseAdmin
        .from('action_recommendations')
        .update({ status: 'acted_upon' })
        .eq('id', recommendationId);

      const action: Action = {
        id: `action_${Date.now()}`,
        type: recommendation.recommended_action as ActionType,
        timestamp: new Date().toISOString(),
        context: {},
        metadata: { recommendation_id: recommendationId },
      };

      await this.recordActionOutcome(userId, action, outcome);
    } catch (error) {
      logger.error({ error, userId, recommendationId }, 'Failed to mark recommendation as acted');
      throw error;
    }
  }
}
