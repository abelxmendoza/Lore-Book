import { logger } from '../../logger';

import type { Goal, GoalInsight, GoalContext } from './types';

/**
 * Detects goal stagnation (no progress for extended periods)
 */
export class StagnationDetector {
  /**
   * Detect stagnant goals
   */
  detect(goals: Goal[], ctx: GoalContext): GoalInsight[] {
    const insights: GoalInsight[] = [];

    for (const goal of goals) {
      // Skip completed or abandoned goals
      if (goal.status === 'completed' || goal.status === 'abandoned') {
        continue;
      }

      const inactivity = this.daysSince(goal.updated_at || goal.created_at);
      const lastAction = goal.last_action_at 
        ? this.daysSince(goal.last_action_at)
        : inactivity;

      // Stagnation threshold: 14-45 days (between active and abandoned)
      if (inactivity >= 14 && inactivity < 45) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'stagnation',
          message: `Goal "${goal.title}" has no progress for ${Math.floor(inactivity)} days. Consider revisiting or breaking it into smaller steps.`,
          confidence: 0.85,
          timestamp: new Date().toISOString(),
          related_goal_id: goal.id,
          metadata: {
            inactivity_days: Math.floor(inactivity),
            last_action_days: Math.floor(lastAction),
            goal_status: goal.status,
          },
        });
      }

      // Check for lack of milestone progress
      if (goal.milestones && goal.milestones.length > 0) {
        const unachievedMilestones = goal.milestones.filter(m => !m.achieved);
        if (unachievedMilestones.length > 0 && inactivity >= 7) {
          const oldestUnachieved = unachievedMilestones
            .map(m => m.target_date ? this.daysSince(m.target_date) : inactivity)
            .sort((a, b) => b - a)[0];

          if (oldestUnachieved > 30) {
            insights.push({
              id: crypto.randomUUID(),
              type: 'stagnation',
              message: `Goal "${goal.title}" has ${unachievedMilestones.length} unachieved milestone(s). Consider reviewing your progress.`,
              confidence: 0.75,
              timestamp: new Date().toISOString(),
              related_goal_id: goal.id,
              metadata: {
                unachieved_milestones: unachievedMilestones.length,
                oldest_milestone_days: Math.floor(oldestUnachieved),
              },
            });
          }
        }
      }
    }

    return insights;
  }

  /**
   * Calculate days since date
   */
  private daysSince(date: string): number {
    const now = Date.now();
    const then = new Date(date).getTime();
    return (now - then) / (1000 * 60 * 60 * 24);
  }
}

