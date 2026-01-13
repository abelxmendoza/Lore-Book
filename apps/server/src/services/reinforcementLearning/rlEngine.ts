import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/**
 * RL Context - Features that describe the current state
 */
export interface RLContext {
  type: string; // 'chat_persona', 'recommendation', etc.
  features: Record<string, any>; // Context features
}

/**
 * Action that can be taken
 */
export interface Action {
  id: string;
  type?: string;
  [key: string]: any; // Additional action properties
}

/**
 * Policy weights for RL
 */
export interface Policy {
  [actionId: string]: number; // Action ID -> weight
}

/**
 * Base RL Engine using epsilon-greedy contextual bandits
 */
export class RLEngine {
  private learningRate: number = 0.1;
  private explorationRate: number = 0.2; // Epsilon for epsilon-greedy
  private defaultWeight: number = 0.5; // Default weight for new actions

  /**
   * Select action using epsilon-greedy policy
   */
  async selectAction(
    userId: string,
    context: RLContext,
    actionSpace: Action[]
  ): Promise<Action> {
    try {
      // Get user's policy (learned preferences)
      const policy = await this.getUserPolicy(userId, context);

      // Exploration vs exploitation
      if (Math.random() < this.explorationRate) {
        // Explore: random action
        const randomAction = this.explore(actionSpace);
        logger.debug(
          { userId, contextType: context.type, action: randomAction.id },
          'RL: Exploring (random action)'
        );
        return randomAction;
      } else {
        // Exploit: best action according to policy
        const bestAction = this.exploit(policy, actionSpace);
        logger.debug(
          { userId, contextType: context.type, action: bestAction.id },
          'RL: Exploiting (best action)'
        );
        return bestAction;
      }
    } catch (error) {
      logger.error({ error, userId, context }, 'RL: Failed to select action, using random');
      return this.explore(actionSpace);
    }
  }

  /**
   * Update policy based on reward
   */
  async updatePolicy(
    userId: string,
    context: RLContext,
    action: Action,
    reward: number
  ): Promise<void> {
    try {
      // Get current policy
      const policy = await this.getUserPolicy(userId, context);

      // Update using policy gradient (simple Q-learning style update)
      const updatedPolicy = this.updatePolicyWeights(
        policy,
        action,
        reward,
        context
      );

      // Save updated policy
      await this.saveUserPolicy(userId, context, updatedPolicy);

      // Log experience for analysis
      await this.logExperience(userId, context, action, reward);

      logger.debug(
        { userId, contextType: context.type, action: action.id, reward },
        'RL: Updated policy'
      );
    } catch (error) {
      logger.error({ error, userId, context, action, reward }, 'RL: Failed to update policy');
    }
  }

  /**
   * Get user's policy for a context type
   */
  private async getUserPolicy(userId: string, context: RLContext): Promise<Policy> {
    try {
      const { data, error } = await supabaseAdmin
        .from('rl_policies')
        .select('policy_weights')
        .eq('user_id', userId)
        .eq('context_type', context.type)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine for new users
        logger.warn({ error, userId, contextType: context.type }, 'RL: Error fetching policy');
      }

      if (data?.policy_weights) {
        return typeof data.policy_weights === 'string'
          ? JSON.parse(data.policy_weights)
          : data.policy_weights;
      }

      // Return default policy
      return this.getDefaultPolicy(context);
    } catch (error) {
      logger.error({ error, userId, context }, 'RL: Failed to get policy');
      return this.getDefaultPolicy(context);
    }
  }

  /**
   * Save user's policy
   */
  private async saveUserPolicy(
    userId: string,
    context: RLContext,
    policy: Policy
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('rl_policies')
        .upsert({
          user_id: userId,
          context_type: context.type,
          policy_weights: policy,
          updated_at: new Date().toISOString(),
        });
    } catch (error) {
      logger.error({ error, userId, context }, 'RL: Failed to save policy');
      throw error;
    }
  }

  /**
   * Log experience for analysis and potential retraining
   */
  private async logExperience(
    userId: string,
    context: RLContext,
    action: Action,
    reward: number
  ): Promise<void> {
    try {
      await supabaseAdmin.from('rl_experiences').insert({
        user_id: userId,
        context_type: context.type,
        context_features: context.features,
        action_taken: action,
        reward,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Non-critical, just log
      logger.debug({ error }, 'RL: Failed to log experience (non-critical)');
    }
  }

  /**
   * Update policy weights using Q-learning style update
   */
  private updatePolicyWeights(
    policy: Policy,
    action: Action,
    reward: number,
    context: RLContext
  ): Policy {
    const updatedPolicy = { ...policy };
    const actionId = action.id;

    // Get current weight (or default)
    const currentWeight = updatedPolicy[actionId] ?? this.defaultWeight;

    // Q-learning update: Q(s,a) = Q(s,a) + α * (reward - Q(s,a))
    const newWeight = currentWeight + this.learningRate * (reward - currentWeight);

    // Update weight (clamp between 0 and 1)
    updatedPolicy[actionId] = Math.max(0, Math.min(1, newWeight));

    return updatedPolicy;
  }

  /**
   * Explore: select random action
   */
  private explore(actionSpace: Action[]): Action {
    if (actionSpace.length === 0) {
      throw new Error('Action space is empty');
    }
    const randomIndex = Math.floor(Math.random() * actionSpace.length);
    return actionSpace[randomIndex];
  }

  /**
   * Exploit: select best action according to policy
   */
  private exploit(policy: Policy, actionSpace: Action[]): Action {
    if (actionSpace.length === 0) {
      throw new Error('Action space is empty');
    }

    // Score each action
    const scoredActions = actionSpace.map(action => ({
      action,
      score: policy[action.id] ?? this.defaultWeight,
    }));

    // Sort by score (descending)
    scoredActions.sort((a, b) => b.score - a.score);

    // Return best action (with some randomness if scores are very close)
    const topScore = scoredActions[0].score;
    const closeActions = scoredActions.filter(
      sa => Math.abs(sa.score - topScore) < 0.1
    );

    if (closeActions.length > 1) {
      // If multiple actions have similar scores, pick randomly among them
      const randomIndex = Math.floor(Math.random() * closeActions.length);
      return closeActions[randomIndex].action;
    }

    return scoredActions[0].action;
  }

  /**
   * Get default policy (equal weights for all actions)
   */
  private getDefaultPolicy(context: RLContext): Policy {
    // Return empty policy - weights will be initialized on first action
    return {};
  }

  /**
   * Set exploration rate (for tuning)
   */
  setExplorationRate(rate: number): void {
    this.explorationRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Set learning rate (for tuning)
   */
  setLearningRate(rate: number): void {
    this.learningRate = Math.max(0, Math.min(1, rate));
  }
}
