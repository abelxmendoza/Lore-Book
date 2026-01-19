import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { shadowEngineModule } from '../../analytics';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates action recommendations
 */
export class ActionGenerator {
  /**
   * Generate action recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // 1. Get abandoned goals
      const goalActions = await this.generateFromAbandonedGoals(userId);
      recommendations.push(...goalActions);

      // 2. Get negative patterns from shadow engine
      const patternActions = await this.generateFromNegativePatterns(userId);
      recommendations.push(...patternActions);

      logger.debug(
        { userId, count: recommendations.length },
        'Generated action recommendations'
      );
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate action recommendations');
    }

    return recommendations;
  }

  /**
   * Generate actions from abandoned goals
   */
  private async generateFromAbandonedGoals(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get recent abandoned goal events
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
          type: 'action',
          title: `Revisit your goal: ${goalText}`,
          description: `You set a goal to ${goalText} ${daysSince} days ago but haven't mentioned it since. Is it still relevant? If so, what's one small step you could take today?`,
          context,
          priority: 8,
          confidence: 0.8,
          source_engine: 'continuity',
          source_data: { event_id: event.id, goal_text: goalText },
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate goal action recommendations');
    }

    return recommendations;
  }

  /**
   * Generate actions from negative patterns
   */
  private async generateFromNegativePatterns(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      const shadow = await shadowEngineModule.run(userId);
      const patterns = (shadow.insights as any[]) || [];

      const negativePatterns = patterns.filter(
        (p: any) => p.type === 'negative_pattern' || p.type === 'suppressed_topic'
      );

      for (const pattern of negativePatterns.slice(0, 2)) {
        const context: RecommendationContext = {
          pattern: pattern.description || 'negative pattern',
          confidence: pattern.confidence || 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'action',
          title: 'Address this pattern',
          description: `You've been in a negative pattern: ${pattern.description || 'this pattern'}. What's one small thing you could do differently today?`,
          context,
          priority: 7,
          confidence: pattern.confidence || 0.6,
          source_engine: 'shadow_engine',
          source_data: { pattern_id: pattern.id },
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate pattern action recommendations');
    }

    return recommendations;
  }
}

