import { logger } from '../../logger';
import type { Goal, GoalInsight, GoalContext } from './types';

/**
 * Calculates goal lifecycle status: active, paused, abandoned, completed
 */
export class GoalStateCalculator {
  /**
   * Calculate goal states and generate insights
   */
  calculate(goals: Goal[], ctx: GoalContext): GoalInsight[] {
    const insights: GoalInsight[] = [];

    for (const goal of goals) {
      // Skip if already completed
      if (goal.status === 'completed') {
        continue;
      }

      const inactivityDays = this.daysSince(goal.updated_at || goal.created_at);
      const lastActionDays = goal.last_action_at 
        ? this.daysSince(goal.last_action_at)
        : inactivityDays;

      // Determine status based on inactivity
      let newStatus: Goal['status'] = goal.status || 'active';
      let insight: GoalInsight | null = null;

      if (inactivityDays > 45 || lastActionDays > 45) {
        newStatus = 'abandoned';
        insight = {
          id: crypto.randomUUID(),
          type: 'goal_state_change',
          message: `Goal "${goal.title}" appears abandoned (no activity for ${Math.floor(inactivityDays)} days).`,
          confidence: 0.9,
          timestamp: new Date().toISOString(),
          related_goal_id: goal.id,
          metadata: {
            inactivity_days: Math.floor(inactivityDays),
            previous_status: goal.status,
          },
        };
      } else if (inactivityDays > 20 || lastActionDays > 20) {
        newStatus = 'paused';
        insight = {
          id: crypto.randomUUID(),
          type: 'goal_state_change',
          message: `Goal "${goal.title}" is paused due to inactivity (${Math.floor(inactivityDays)} days since last update).`,
          confidence: 0.75,
          timestamp: new Date().toISOString(),
          related_goal_id: goal.id,
          metadata: {
            inactivity_days: Math.floor(inactivityDays),
            previous_status: goal.status,
          },
        };
      } else {
        newStatus = 'active';
      }

      // Update goal status
      goal.status = newStatus;

      // Add insight if status changed
      if (insight && goal.status !== insight.metadata?.previous_status) {
        insights.push(insight);
      }

      // Check for completion indicators
      if (this.isCompleted(goal, ctx)) {
        goal.status = 'completed';
        insights.push({
          id: crypto.randomUUID(),
          type: 'goal_state_change',
          message: `Goal "${goal.title}" appears to be completed.`,
          confidence: 0.85,
          timestamp: new Date().toISOString(),
          related_goal_id: goal.id,
          metadata: {
            previous_status: newStatus,
            completion_indicators: this.getCompletionIndicators(goal, ctx),
          },
        });
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

  /**
   * Check if goal appears completed
   */
  private isCompleted(goal: Goal, ctx: GoalContext): boolean {
    // Check if all milestones are achieved
    if (goal.milestones && goal.milestones.length > 0) {
      const allAchieved = goal.milestones.every(m => m.achieved);
      if (allAchieved) return true;
    }

    // Check for completion keywords in recent entries
    const recentEntries = (ctx.entries || [])
      .filter((e: any) => {
        const entryDate = new Date(e.date || e.created_at);
        const goalDate = new Date(goal.updated_at);
        return entryDate >= goalDate;
      })
      .slice(0, 5);

    const completionKeywords = ['completed', 'finished', 'achieved', 'done', 'accomplished'];
    for (const entry of recentEntries) {
      const content = (entry.content || '').toLowerCase();
      const goalTitle = goal.title.toLowerCase();
      
      // Check if entry mentions goal and completion
      if (content.includes(goalTitle) && completionKeywords.some(kw => content.includes(kw))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get completion indicators
   */
  private getCompletionIndicators(goal: Goal, ctx: GoalContext): string[] {
    const indicators: string[] = [];

    if (goal.milestones && goal.milestones.every(m => m.achieved)) {
      indicators.push('all_milestones_achieved');
    }

    const recentEntries = (ctx.entries || []).slice(0, 5);
    for (const entry of recentEntries) {
      const content = (entry.content || '').toLowerCase();
      if (content.includes(goal.title.toLowerCase()) && 
          (content.includes('completed') || content.includes('finished'))) {
        indicators.push('completion_mentioned_in_entry');
      }
    }

    return indicators;
  }
}

