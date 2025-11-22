import { v4 as uuid } from 'uuid';

import { logger } from '../../../logger';
import type { Recommendation, RecommendationContext } from '../types';
import { ChronologyEngine, EventMapper } from '../../chronology';
import { supabaseAdmin } from '../../supabaseClient';

/**
 * Generates gap filler recommendations
 */
export class GapFillerGenerator {
  private chronologyEngine: ChronologyEngine;
  private eventMapper: EventMapper;

  constructor() {
    this.chronologyEngine = new ChronologyEngine();
    this.eventMapper = new EventMapper();
  }

  /**
   * Generate gap filler recommendations
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(100);

      if (!entries || entries.length === 0) return recommendations;

      // Convert to events and detect gaps
      const events = this.eventMapper.mapMemoryEntriesToEvents(entries);
      const chronologyResult = await this.chronologyEngine.process(events);
      const gaps = chronologyResult.gaps;

      // Generate recommendations for significant gaps
      for (const gap of gaps.slice(0, 3)) {
        if (gap.durationDays < 7) continue; // Only suggest filling gaps > 7 days

        const context: RecommendationContext = {
          timeframe: `${gap.durationDays} days`,
          confidence: 0.7,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'gap_filler',
          title: 'Fill the gap',
          description: `You have a ${gap.durationDays}-day gap in your journal (${gap.start} to ${gap.end}). What happened during that time?`,
          context,
          priority: 5,
          confidence: 0.7,
          source_engine: 'chronology',
          source_data: { gap_start: gap.start, gap_end: gap.end, duration_days: gap.durationDays },
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate gap filler recommendations');
    }

    return recommendations;
  }
}

