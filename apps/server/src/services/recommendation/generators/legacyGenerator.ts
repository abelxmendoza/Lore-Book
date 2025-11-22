import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';
import { essenceProfileService } from '../../essenceProfileService';

/**
 * Generates legacy building recommendations
 */
export class LegacyGenerator {
  /**
   * Generate legacy building recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get essence profile for values and wisdom
      const profile = await essenceProfileService.getProfile(userId);

      if (!profile) return recommendations;

      // Check for values that could be documented
      const values = profile.values || [];
      if (values.length > 0) {
        // Check if values have been written about recently
        const { data: recentEntries } = await supabaseAdmin
          .from('journal_entries')
          .select('content')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(20);

        const recentContent = (recentEntries || [])
          .map(e => e.content.toLowerCase())
          .join(' ');

        for (const value of values.slice(0, 2)) {
          if (!recentContent.includes(value.toLowerCase())) {
            const context: RecommendationContext = {
              entity: value,
              confidence: 0.6,
            };

            recommendations.push({
              id: uuid(),
              user_id: userId,
              type: 'legacy_building',
              title: `Document your value: ${value}`,
              description: `Your value around ${value} is clear. Consider writing about what it means to you and how it's shaped your life.`,
              context,
              priority: 4,
              confidence: 0.6,
              source_engine: 'essence_profile',
              source_data: { value },
              status: 'pending',
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      // Check for wisdom/lessons learned
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, tags')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(50);

      // Look for entries with learning/lesson indicators
      const lessonKeywords = ['learned', 'taught me', 'realized', 'understood', 'lesson'];
      const hasLessons = (entries || []).some(entry =>
        lessonKeywords.some(keyword => entry.content.toLowerCase().includes(keyword))
      );

      if (hasLessons) {
        const context: RecommendationContext = {
          pattern: 'wisdom',
          confidence: 0.5,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'legacy_building',
          title: 'Preserve your wisdom',
          description: 'You\'ve learned important lessons. Consider writing them down for future you or others.',
          context,
          priority: 4,
          confidence: 0.5,
          source_engine: 'essence_profile',
          source_data: {},
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate legacy recommendations');
    }

    return recommendations;
  }
}

