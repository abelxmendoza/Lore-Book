import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { insightEngineModule } from '../../analytics';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates reflection questions based on patterns and changes
 */
export class ReflectionQuestionGenerator {
  /**
   * Generate reflection questions
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // 1. Get continuity events (identity drift, contradictions, etc.)
      const continuityQuestions = await this.generateFromContinuity(userId);
      recommendations.push(...continuityQuestions);

      // 2. Get insights (behavioral loops, patterns)
      const insightQuestions = await this.generateFromInsights(userId);
      recommendations.push(...insightQuestions);

      logger.debug(
        { userId, count: recommendations.length },
        'Generated reflection questions'
      );
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate reflection questions');
    }

    return recommendations;
  }

  /**
   * Generate questions from continuity events
   */
  private async generateFromContinuity(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get recent continuity events
      const { data: events } = await supabaseAdmin
        .from('continuity_events')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', ['identity_drift', 'contradiction', 'arc_shift'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (!events || events.length === 0) return recommendations;

      for (const event of events) {
        let question: string;
        let title: string;
        const context: RecommendationContext = {
          pattern: event.event_type,
          confidence: 0.7,
        };

        if (event.event_type === 'identity_drift') {
          title = 'Explore your identity shift';
          question = 'You mentioned something different about yourself recently. What changed, and how do you feel about that shift?';
        } else if (event.event_type === 'contradiction') {
          title = 'Resolve the contradiction';
          question = `You said "${event.description}". This seems to contradict something you mentioned before. What's really true here?`;
        } else if (event.event_type === 'arc_shift') {
          title = 'Reflect on this life change';
          question = 'You seem to be entering a new phase. What ended, and what\'s beginning?';
        } else {
          continue;
        }

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'reflection_question',
          title,
          description: question,
          context,
          priority: event.severity || 7,
          confidence: 0.7,
          source_engine: 'continuity',
          source_data: { event_id: event.id, event_type: event.event_type },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate continuity reflection questions');
    }

    return recommendations;
  }

  /**
   * Generate questions from insights
   */
  private async generateFromInsights(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      const insights = await insightEngineModule.run(userId);
      const insightsList = (insights.insights as any[]) || [];

      // Find behavioral loops
      const loops = insightsList.filter(
        (i: any) => i.type === 'behavioral_loop' || i.type === 'cyclic_behavior'
      );

      for (const loop of loops.slice(0, 3)) {
        const context: RecommendationContext = {
          pattern: loop.description || 'behavioral loop',
          confidence: loop.confidence || 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'reflection_question',
          title: 'Break the cycle',
          description: `You've been in a loop with ${loop.description || 'this pattern'}. What would breaking it look like?`,
          context,
          priority: 7,
          confidence: loop.confidence || 0.6,
          source_engine: 'insight_engine',
          source_data: { insight_id: loop.id, insight_type: loop.type },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate insight reflection questions');
    }

    return recommendations;
  }
}

