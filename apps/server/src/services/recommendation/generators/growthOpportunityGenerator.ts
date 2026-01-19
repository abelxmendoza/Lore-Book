import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { identityPulseModule, insightEngineModule } from '../../analytics';
import type { Recommendation, RecommendationContext } from '../types';

/**
 * Generates growth opportunity recommendations
 */
export class GrowthOpportunityGenerator {
  /**
   * Generate growth opportunity recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get identity pulse for growth areas
      const identity = await identityPulseModule.run(userId);
      const metrics = identity.metrics as any;

      // Check for low sentiment or high volatility (growth opportunities)
      if (metrics.sentimentTrajectory && metrics.sentimentTrajectory < -0.2) {
        const context: RecommendationContext = {
          pattern: 'low sentiment',
          confidence: 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'growth_opportunity',
          title: 'Explore what\'s challenging you',
          description: 'You\'ve been feeling lower lately. What would growth look like in this area?',
          context,
          priority: 6,
          confidence: 0.6,
          source_engine: 'identity_pulse',
          source_data: { sentiment: metrics.sentimentTrajectory },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Get insights for patterns to break
      const insights = await insightEngineModule.run(userId);
      const insightsList = (insights.insights as any[]) || [];

      const negativePatterns = insightsList.filter(
        (i: any) => i.type === 'behavioral_loop' && (i.confidence || 0) > 0.6
      );

      for (const pattern of negativePatterns.slice(0, 2)) {
        const context: RecommendationContext = {
          pattern: pattern.description || 'pattern',
          confidence: pattern.confidence || 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'growth_opportunity',
          title: 'Break this pattern',
          description: `Breaking ${pattern.description || 'this pattern'} could open new possibilities. What's the first step?`,
          context,
          priority: 7,
          confidence: pattern.confidence || 0.6,
          source_engine: 'insight_engine',
          source_data: { pattern_id: pattern.id },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate growth opportunity recommendations');
    }

    return recommendations;
  }
}

