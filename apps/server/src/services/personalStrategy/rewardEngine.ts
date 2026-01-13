import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { goalValueAlignmentService } from '../goalValueAlignmentService';
import { habitsEngine } from '../habits/habitEngine';
import { goalsEngine } from '../goals/goalEngine';
import type { RLStateVector, Action, RewardWeights } from './types';

export class RewardEngine {
  private defaultWeights: RewardWeights = {
    consistency_weight: 0.3,
    progress_weight: 0.4,
    alignment_weight: 0.3,
    anxiety_weight: 0.2,
    avoidance_weight: 0.3,
    growth_weight: 0.2,
    relationship_weight: 0.1,
  };

  private async getWeights(userId: string): Promise<RewardWeights> {
    try {
      const { data } = await supabaseAdmin
        .from('reward_weights')
        .select('weights')
        .eq('user_id', userId)
        .single();

      if (data?.weights) {
        return { ...this.defaultWeights, ...data.weights };
      }

      await supabaseAdmin
        .from('reward_weights')
        .insert({
          user_id: userId,
          weights: this.defaultWeights,
        });

      return this.defaultWeights;
    } catch (error) {
      logger.debug({ error }, 'Failed to get reward weights');
      return this.defaultWeights;
    }
  }

  async evaluateReward(
    userId: string,
    state: RLStateVector,
    action: Action,
    previousState?: RLStateVector
  ): Promise<number> {
    try {
      const weights = await this.getWeights(userId);
      let reward = 0.0;

      const consistencyScore = await this.getConsistencyScore(userId, action);
      reward += weights.consistency_weight * consistencyScore;

      const progressScore = await this.getProgressScore(userId, action);
      reward += weights.progress_weight * progressScore;

      const alignmentScore = await this.getAlignmentScore(userId, action);
      reward += weights.alignment_weight * alignmentScore;

      const growthScore = await this.getGrowthScore(userId, action);
      reward += weights.growth_weight * growthScore;

      const relationshipScore = await this.getRelationshipScore(userId, action);
      reward += weights.relationship_weight * relationshipScore;

      const anxietyPenalty = await this.getAnxietyPenalty(userId, state, action);
      reward -= weights.anxiety_weight * anxietyPenalty;

      const avoidancePenalty = await this.getAvoidancePenalty(userId, action);
      reward -= weights.avoidance_weight * avoidancePenalty;

      // Pattern-based reward shaping (from supervised learning)
      if (state.pattern_type) {
        const patternReward = this.getPatternReward(state.pattern_type, action);
        reward += 0.1 * patternReward;
      }

      // Predicted alignment impact (if available in action metadata)
      if (action.metadata?.predicted_alignment_delta !== undefined) {
        const alignmentDelta = action.metadata.predicted_alignment_delta as number;
        reward += weights.alignment_weight * alignmentDelta * 0.5; // Scale down prediction impact
      }

      if (previousState) {
        const stateImprovement = this.calculateStateImprovement(state, previousState);
        reward += 0.1 * stateImprovement;
      }

      return Math.max(-1.0, Math.min(1.0, reward));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to evaluate reward');
      return 0.0;
    }
  }

  private async getConsistencyScore(userId: string, action: Action): Promise<number> {
    try {
      const habits = await habitsEngine.getHabits(userId);
      const relevantHabit = habits.find(h => {
        const habitAction = (h.action || '').toLowerCase();
        return habitAction.includes(action.type.toLowerCase()) || action.type.toLowerCase().includes(habitAction);
      });

      if (!relevantHabit) return 0.0;
      return Math.min((relevantHabit.streak || 0) / 30, 1.0);
    } catch (error) {
      logger.debug({ error }, 'Failed to get consistency score');
      return 0.0;
    }
  }

  private async getProgressScore(userId: string, action: Action): Promise<number> {
    try {
      if (!action.context.goal_ids || action.context.goal_ids.length === 0) {
        return 0.0;
      }

      const goals = await goalsEngine.getGoals(userId);
      const relevantGoals = goals.filter(g => 
        action.context.goal_ids!.includes(g.id) && g.status === 'active'
      );

      if (relevantGoals.length === 0) return 0.0;

      const avgProgress = relevantGoals.reduce((sum, g) => {
        const milestones = g.milestones || [];
        const completed = milestones.filter((m: any) => m.completed).length;
        return sum + (completed / Math.max(milestones.length, 1));
      }, 0) / relevantGoals.length;

      return avgProgress;
    } catch (error) {
      logger.debug({ error }, 'Failed to get progress score');
      return 0.0;
    }
  }

  private async getAlignmentScore(userId: string, action: Action): Promise<number> {
    try {
      if (!action.context.value_ids || action.context.value_ids.length === 0) {
        return 0.0;
      }

      const valueId = action.context.value_ids[0];
      const alignment = await goalValueAlignmentService.getAlignmentSnapshot(userId, valueId);
      return alignment?.alignment_score || 0.0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get alignment score');
      return 0.0;
    }
  }

  private async getGrowthScore(userId: string, action: Action): Promise<number> {
    try {
      const growthActions = ['learn', 'create', 'explore', 'grow', 'reflect'];
      if (growthActions.includes(action.type)) {
        return 0.5;
      }

      const { learningEngine } = await import('../learning/learningEngine');
      const learning = await learningEngine.getLearning(userId, { limit: 10, orderBy: 'date' });
      const recentLearning = learning.activities?.slice(0, 5) || [];
      const hasLearning = recentLearning.some(l => 
        (l.description || '').toLowerCase().includes(action.type.toLowerCase())
      );

      return hasLearning ? 0.3 : 0.0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get growth score');
      return 0.0;
    }
  }

  private async getRelationshipScore(userId: string, action: Action): Promise<number> {
    try {
      if (action.type === 'socialize' || action.type === 'connect') {
        return 0.4;
      }

      if (action.context.people && action.context.people.length > 0) {
        return Math.min(0.2 * action.context.people.length, 0.5);
      }

      return 0.0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get relationship score');
      return 0.0;
    }
  }

  private async getAnxietyPenalty(
    userId: string,
    state: RLStateVector,
    action: Action
  ): Promise<number> {
    try {
      if (state.stress > 0.7 && action.type === 'avoid') {
        return 0.5;
      }

      const stressIncreasingActions = ['work', 'avoid'];
      if (state.stress > 0.6 && stressIncreasingActions.includes(action.type)) {
        return 0.3;
      }

      return 0.0;
    } catch (error) {
      logger.debug({ error }, 'Failed to get anxiety penalty');
      return 0.0;
    }
  }

  private async getAvoidancePenalty(userId: string, action: Action): Promise<number> {
    if (action.type === 'avoid' || action.type === 'consume_noise') {
      return 1.0;
    }
    return 0.0;
  }

  private getPatternReward(patternType: RLStateVector['pattern_type'], action: Action): number {
    if (!patternType) return 0;

    // Reward actions that break negative patterns
    if (patternType === 'avoidance_spiral' && action.type !== 'avoid') {
      return 0.5; // Breaking avoidance
    }

    if (patternType === 'burnout_risk' && action.type === 'rest') {
      return 0.5; // Resting during burnout risk
    }

    if (patternType === 'stagnation' && ['learn', 'explore', 'grow'].includes(action.type)) {
      return 0.5; // Breaking stagnation
    }

    // Reward actions that maintain positive patterns
    if (patternType === 'growth' && ['learn', 'create', 'grow'].includes(action.type)) {
      return 0.3; // Maintaining growth
    }

    if (patternType === 'recovery' && action.type === 'rest') {
      return 0.3; // Supporting recovery
    }

    return 0;
  }

  private calculateStateImprovement(
    current: RLStateVector,
    previous: RLStateVector
  ): number {
    const moodImprovement = current.mood - previous.mood;
    const energyImprovement = current.energy - previous.energy;
    const stressReduction = previous.stress - current.stress;
    const alignmentImprovement = current.identity_alignment - previous.identity_alignment;

    return (
      moodImprovement * 0.3 +
      energyImprovement * 0.2 +
      stressReduction * 0.3 +
      alignmentImprovement * 0.2
    );
  }

  async updateWeights(userId: string, weights: Partial<RewardWeights>): Promise<void> {
    try {
      await supabaseAdmin
        .from('reward_weights')
        .upsert({
          user_id: userId,
          weights: { ...this.defaultWeights, ...weights },
          updated_at: new Date().toISOString(),
        });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update reward weights');
      throw error;
    }
  }
}
