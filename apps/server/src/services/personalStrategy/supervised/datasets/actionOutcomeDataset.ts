import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { ActionOutcome } from '../types';
import type { RLStateVector } from '../../types';

export interface ActionOutcomeExample {
  action_id: string;
  action_type: string;
  state_features: number[];
  outcome: ActionOutcome;
  reward: number;
  timestamp: string;
}

/**
 * Dataset for action outcome prediction
 * Loads state-action-outcome triplets
 */
export class ActionOutcomeDataset {
  /**
   * Load training examples for outcome prediction
   */
  async loadTrainingExamples(
    userId: string,
    limit: number = 1000
  ): Promise<ActionOutcomeExample[]> {
    try {
      // Get actions with outcomes
      const { data: actions } = await supabaseAdmin
        .from('strategy_actions')
        .select('*')
        .eq('user_id', userId)
        .not('outcome', 'is', null)
        .not('outcome', 'eq', 'unknown')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!actions || actions.length === 0) {
        logger.debug({ userId }, 'No action outcomes found');
        return [];
      }

      const examples: ActionOutcomeExample[] = [];

      for (const action of actions) {
        const stateFeatures = await this.extractStateFeatures(action, userId);
        
        if (stateFeatures.length > 0) {
          examples.push({
            action_id: action.id,
            action_type: action.action_type,
            state_features: stateFeatures,
            outcome: action.outcome as ActionOutcome,
            reward: action.reward || 0,
            timestamp: action.timestamp,
          });
        }
      }

      logger.info({ userId, examples: examples.length }, 'Loaded action outcome examples');
      return examples;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load action outcome examples');
      return [];
    }
  }

  /**
   * Extract state features for action
   */
  private async extractStateFeatures(action: any, userId: string): Promise<number[]> {
    try {
      // Get state snapshot at time of action
      const actionTime = new Date(action.timestamp);
      
      const { data: snapshot } = await supabaseAdmin
        .from('state_snapshots')
        .select('snapshot_data')
        .eq('user_id', userId)
        .lte('timestamp', actionTime.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (snapshot?.snapshot_data) {
        const state = snapshot.snapshot_data as RLStateVector;
        return this.stateToFeatures(state, action.action_type);
      }

      // Fallback: use state from action context if available
      if (action.context?.state_features) {
        return action.context.state_features;
      }

      return [];
    } catch (error) {
      logger.debug({ error }, 'Failed to extract state features');
      return [];
    }
  }

  /**
   * Convert state vector to feature array
   */
  private stateToFeatures(state: RLStateVector, actionType: string): number[] {
    const features: number[] = [];

    // Core state features
    features.push(state.mood); // -1 to 1
    features.push(state.energy); // 0 to 1
    features.push(state.stress); // 0 to 1
    features.push(state.consistency_score); // 0 to 1
    features.push(state.identity_alignment); // 0 to 1
    features.push(state.goal_progress_score); // 0 to 1
    features.push(state.social_activity_score); // 0 to 1
    features.push(state.relationship_health_score); // 0 to 1

    // Temporal features
    features.push(state.time_of_day / 24); // 0 to 1
    features.push(state.day_of_week / 7); // 0 to 1
    features.push(Math.min(state.days_since_last_entry / 7, 1.0)); // Normalized

    // Goal features
    features.push(Math.min(state.active_goals_count / 10, 1.0)); // Normalized
    features.push(state.goal_at_risk_count / Math.max(state.active_goals_count, 1)); // Ratio

    // Action type encoding (one-hot would be better, but simple for now)
    const actionTypes = ['train', 'code', 'rest', 'socialize', 'reflect', 'learn', 'create', 'work'];
    const actionIndex = actionTypes.indexOf(actionType);
    features.push(actionIndex >= 0 ? 1 : 0); // Binary indicator

    // Recent actions (last 3)
    const recentActions = state.last_actions.slice(0, 3);
    features.push(recentActions.length / 3); // Normalized count

    return features;
  }

  /**
   * Create example from current state and action
   */
  async createExample(
    userId: string,
    state: RLStateVector,
    actionType: string,
    outcome: ActionOutcome,
    reward: number
  ): Promise<ActionOutcomeExample> {
    const stateFeatures = this.stateToFeatures(state, actionType);

    return {
      action_id: `example_${Date.now()}`,
      action_type: actionType,
      state_features: stateFeatures,
      outcome,
      reward,
      timestamp: new Date().toISOString(),
    };
  }
}
