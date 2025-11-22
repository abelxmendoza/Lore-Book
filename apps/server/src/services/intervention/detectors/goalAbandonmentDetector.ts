import { Intervention, InterventionContext } from '../types';

/**
 * Detects abandoned goals
 */
export class GoalAbandonmentDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      const abandonedGoals = ctx.continuity?.abandonedGoals || [];
      const goals = ctx.goals || [];

      // Process abandoned goals from continuity engine
      for (const goal of abandonedGoals) {
        const daysSinceLastUpdate = goal.daysSinceLastUpdate || 0;
        const severity = daysSinceLastUpdate > 90 ? 'high' : daysSinceLastUpdate > 60 ? 'medium' : 'low';

        interventions.push({
          id: crypto.randomUUID(),
          type: 'abandoned_goal',
          severity: severity as any,
          confidence: goal.confidence || 0.8,
          message: `Your goal "${goal.title || goal.text}" appears to be stalled. It hasn't been mentioned in ${daysSinceLastUpdate} days.`,
          timestamp: new Date().toISOString(),
          related_events: goal.lastUpdateEventId ? [goal.lastUpdateEventId] : undefined,
          context: {
            goal_id: goal.id,
            days_since_last_update: daysSinceLastUpdate,
            original_goal_text: goal.text || goal.title,
          },
        });
      }

      // Check goals from goals context if available
      if (Array.isArray(goals)) {
        for (const goal of goals) {
          if (goal.status === 'abandoned' || goal.status === 'stalled') {
            const daysSince = goal.daysSinceLastUpdate || goal.daysSince || 0;
            const severity = daysSince > 90 ? 'high' : daysSince > 60 ? 'medium' : 'low';

            interventions.push({
              id: crypto.randomUUID(),
              type: 'abandoned_goal',
              severity: severity as any,
              confidence: 0.7,
              message: `Your goal "${goal.title || goal.name}" appears to be ${goal.status}.`,
              timestamp: new Date().toISOString(),
              context: {
                goal_id: goal.id,
                days_since_last_update: daysSince,
              },
            });
          }
        }
      }
    } catch (error) {
      // Silently fail
    }

    return interventions;
  }
}

