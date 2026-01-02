import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates goal reminder recommendations
 */
export class GoalReminderGenerator {
  /**
   * Generate goal reminder recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get abandoned goal events
      const { data: events } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .eq('event_type', 'abandoned_goal')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!events || events.length === 0) return recommendations;

      for (const event of events) {
        const goalText = (event.metadata as any)?.goal_text || 'this goal';
        const daysSince = (event.metadata as any)?.days_since_last_mention || 0;

        const context: RecommendationContext = {
          entity: goalText,
          timeframe: `${daysSince} days ago`,
          confidence: 0.8,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'goal_reminder',
          title: `Goal reminder: ${goalText}`,
          description: `You set a goal to ${goalText} ${daysSince} days ago. Is it still relevant? If so, what's your next step?`,
          context,
          priority: 7,
          confidence: 0.8,
          source_engine: 'continuity',
          source_data: { event_id: event.id, goal_text: goalText },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate goal reminders');
    }

    return recommendations;
  }
}

