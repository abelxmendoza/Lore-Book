import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { ReflectionExtractor } from './reflectionExtractor';
import type { Reflection, ReflectionOutput, ReflectionInsight } from './types';

/**
 * Reflection Engine V1
 * Simple extraction and analysis of reflections from journal entries
 */
export class ReflectionEngine {
  private extractor: ReflectionExtractor;

  constructor() {
    this.extractor = new ReflectionExtractor();
  }

  /**
   * Process reflections for a user
   */
  async process(userId: string): Promise<ReflectionOutput> {
    try {
      logger.debug({ userId }, 'Processing reflections');

      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);

      // Extract reflections
      const reflections = this.extractor.extract(entries || []);
      reflections.forEach(r => { r.user_id = userId; });

      // Generate insights
      const insights: ReflectionInsight[] = [];

      if (reflections.length > 0) {
        // Count by type
        const byType = reflections.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

        insights.push({
          id: crypto.randomUUID(),
          type: 'reflection_detected',
          message: `${reflections.length} reflections detected. Most common type: ${topType[0]} (${topType[1]} times).`,
          confidence: 0.9,
          timestamp: new Date().toISOString(),
          user_id: userId,
          reflection_ids: reflections.map(r => r.id || ''),
          metadata: {
            total_reflections: reflections.length,
            by_type: byType,
          },
        });

        // Growth moments
        const growthReflections = reflections.filter(r => r.type === 'growth');
        if (growthReflections.length > 0) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'growth_moment',
            message: `${growthReflections.length} growth moments detected in your reflections.`,
            confidence: 0.85,
            timestamp: new Date().toISOString(),
            user_id: userId,
            reflection_ids: growthReflections.map(r => r.id || ''),
            metadata: {
              growth_count: growthReflections.length,
            },
          });
        }
      }

      logger.info(
        {
          userId,
          reflections: reflections.length,
          insights: insights.length,
        },
        'Processed reflections'
      );

      return {
        reflections,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process reflections');
      return {
        reflections: [],
        insights: [],
      };
    }
  }
}

