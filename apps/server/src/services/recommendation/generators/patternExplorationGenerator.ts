import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import type { Recommendation, RecommendationContext } from '../types';
import { insightEngineModule, shadowEngineModule } from '../../analytics';

/**
 * Generates pattern exploration recommendations
 */
export class PatternExplorationGenerator {
  /**
   * Generate pattern exploration recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get insights
      const insights = await insightEngineModule.run(userId);
      const insightsList = (insights.insights as any[]) || [];

      // Get behavioral loops
      const loops = insightsList.filter(
        (i: any) => i.type === 'behavioral_loop' || i.type === 'cyclic_behavior'
      );

      for (const loop of loops.slice(0, 3)) {
        const context: RecommendationContext = {
          pattern: loop.description || 'behavioral pattern',
          confidence: loop.confidence || 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'pattern_exploration',
          title: 'Explore this pattern',
          description: `You've been in a loop with ${loop.description || 'this pattern'}. What's keeping you there, and what would breaking it look like?`,
          context,
          priority: 6,
          confidence: loop.confidence || 0.6,
          source_engine: 'insight_engine',
          source_data: { insight_id: loop.id, pattern_type: loop.type },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Get shadow patterns
      const shadow = await shadowEngineModule.run(userId);
      const shadowPatterns = (shadow.insights as any[]) || [];

      for (const pattern of shadowPatterns.slice(0, 2)) {
        const context: RecommendationContext = {
          pattern: pattern.description || 'shadow pattern',
          confidence: pattern.confidence || 0.5,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'pattern_exploration',
          title: 'Explore this shadow pattern',
          description: `${pattern.description || 'This pattern'} keeps appearing. What does it mean to you?`,
          context,
          priority: 6,
          confidence: pattern.confidence || 0.5,
          source_engine: 'shadow_engine',
          source_data: { pattern_id: pattern.id },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate pattern exploration recommendations');
    }

    return recommendations;
  }
}

