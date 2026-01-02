import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates continuity follow-up recommendations
 */
export class ContinuityFollowupGenerator {
  /**
   * Generate continuity follow-up recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get recent continuity events
      const { data: events } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', ['contradiction', 'identity_drift', 'abandoned_goal'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (!events || events.length === 0) return recommendations;

      for (const event of events) {
        let question: string;
        let title: string;
        const context: RecommendationContext = {
          pattern: event.event_type,
          confidence: 0.8,
        };

        if (event.event_type === 'contradiction') {
          title = 'Resolve this contradiction';
          question = `You said "${event.description}". This seems to contradict something you mentioned before. What's really true here?`;
        } else if (event.event_type === 'identity_drift') {
          title = 'Explore your identity shift';
          question = 'Your identity seems to be shifting. How do you feel about that change?';
        } else if (event.event_type === 'abandoned_goal') {
          const goalText = (event.metadata as any)?.goal_text || 'this goal';
          title = 'Decide on this goal';
          question = `You abandoned ${goalText}. Was that intentional, or did you just lose track?`;
        } else {
          continue;
        }

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'continuity_followup',
          title,
          description: question,
          context,
          priority: event.severity || 8,
          confidence: 0.8,
          source_engine: 'continuity',
          source_data: { event_id: event.id, event_type: event.event_type },
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate continuity follow-ups');
    }

    return recommendations;
  }
}

