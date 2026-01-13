import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { RLStateVector } from '../../types';

export interface AlignmentExample {
  action_id: string;
  action_type: string;
  state_before: number[];
  state_after: number[];
  alignment_delta: number; // Change in alignment
  timestamp: string;
}

/**
 * Dataset for identity alignment impact prediction
 * Loads state-action pairs with alignment changes
 */
export class AlignmentDataset {
  /**
   * Load training examples for alignment regression
   */
  async loadTrainingExamples(
    userId: string,
    limit: number = 1000
  ): Promise<AlignmentExample[]> {
    try {
      // Get actions with state snapshots before and after
      const { data: actions } = await supabaseAdmin
        .from('strategy_actions')
        .select('*')
        .eq('user_id', userId)
        .not('state_snapshot_id', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!actions || actions.length === 0) {
        logger.debug({ userId }, 'No alignment examples found');
        return [];
      }

      const examples: AlignmentExample[] = [];

      for (const action of actions) {
        const example = await this.createExampleFromAction(action, userId);
        if (example) {
          examples.push(example);
        }
      }

      logger.info({ userId, examples: examples.length }, 'Loaded alignment examples');
      return examples;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load alignment examples');
      return [];
    }
  }

  /**
   * Create example from action with state snapshots
   */
  private async createExampleFromAction(
    action: any,
    userId: string
  ): Promise<AlignmentExample | null> {
    try {
      const actionTime = new Date(action.timestamp);

      // Get state before action (closest snapshot before)
      const { data: stateBefore } = await supabaseAdmin
        .from('state_snapshots')
        .select('snapshot_data')
        .eq('user_id', userId)
        .lt('timestamp', actionTime.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      // Get state after action (closest snapshot after, within 7 days)
      const sevenDaysLater = new Date(actionTime);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      const { data: stateAfter } = await supabaseAdmin
        .from('state_snapshots')
        .select('snapshot_data')
        .eq('user_id', userId)
        .gt('timestamp', actionTime.toISOString())
        .lte('timestamp', sevenDaysLater.toISOString())
        .order('timestamp', { ascending: true })
        .limit(1)
        .single();

      if (!stateBefore?.snapshot_data || !stateAfter?.snapshot_data) {
        return null;
      }

      const before = stateBefore.snapshot_data as RLStateVector;
      const after = stateAfter.snapshot_data as RLStateVector;

      const alignmentDelta = after.identity_alignment - before.identity_alignment;

      return {
        action_id: action.id,
        action_type: action.action_type,
        state_before: this.stateToFeatures(before, action.action_type),
        state_after: this.stateToFeatures(after, action.action_type),
        alignment_delta: alignmentDelta,
        timestamp: action.timestamp,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to create alignment example');
      return null;
    }
  }

  /**
   * Convert state to feature array
   */
  private stateToFeatures(state: RLStateVector, actionType: string): number[] {
    const features: number[] = [];

    // Core state features
    features.push(state.mood);
    features.push(state.energy);
    features.push(state.stress);
    features.push(state.consistency_score);
    features.push(state.identity_alignment);
    features.push(state.goal_progress_score);
    features.push(state.social_activity_score);
    features.push(state.relationship_health_score);

    // Temporal
    features.push(state.time_of_day / 24);
    features.push(state.day_of_week / 7);

    // Goal state
    features.push(Math.min(state.active_goals_count / 10, 1.0));
    features.push(state.goal_at_risk_count / Math.max(state.active_goals_count, 1));

    // Action type
    const actionTypes = ['train', 'code', 'rest', 'socialize', 'reflect', 'learn', 'create', 'work'];
    const actionIndex = actionTypes.indexOf(actionType);
    features.push(actionIndex >= 0 ? 1 : 0);

    return features;
  }

  /**
   * Create example from state transition
   */
  async createExample(
    userId: string,
    stateBefore: RLStateVector,
    stateAfter: RLStateVector,
    actionType: string
  ): Promise<AlignmentExample> {
    const alignmentDelta = stateAfter.identity_alignment - stateBefore.identity_alignment;

    return {
      action_id: `example_${Date.now()}`,
      action_type: actionType,
      state_before: this.stateToFeatures(stateBefore, actionType),
      state_after: this.stateToFeatures(stateAfter, actionType),
      alignment_delta: alignmentDelta,
      timestamp: new Date().toISOString(),
    };
  }
}
