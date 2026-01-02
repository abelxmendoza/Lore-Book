import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Narrative, NarrativeQuery, NarrativeStats, NarrativeType, NarrativeStatus } from './types';

/**
 * Handles storage and retrieval of narratives
 */
export class NarrativeStorage {
  /**
   * Save narrative
   */
  async saveNarrative(narrative: Narrative): Promise<Narrative | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('narratives')
        .insert({
          user_id: narrative.user_id,
          type: narrative.type,
          style: narrative.style,
          title: narrative.title,
          summary: narrative.summary,
          segments: narrative.segments,
          transitions: narrative.transitions,
          entry_ids: narrative.entry_ids,
          start_date: narrative.start_date,
          end_date: narrative.end_date,
          themes: narrative.themes,
          characters: narrative.characters,
          emotional_arc: narrative.emotional_arc,
          status: narrative.status || 'draft',
          metadata: narrative.metadata,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save narrative');
        return null;
      }

      logger.debug({ narrativeId: data?.id }, 'Saved narrative');
      return data as Narrative;
    } catch (error) {
      logger.error({ error }, 'Failed to save narrative');
      return null;
    }
  }

  /**
   * Get narrative by ID
   */
  async getNarrative(narrativeId: string, userId: string): Promise<Narrative | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('narratives')
        .select('*')
        .eq('id', narrativeId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as Narrative;
    } catch (error) {
      logger.error({ error, narrativeId }, 'Failed to get narrative');
      return null;
    }
  }

  /**
   * Query narratives
   */
  async queryNarratives(userId: string, query: NarrativeQuery): Promise<Narrative[]> {
    try {
      let dbQuery = supabaseAdmin
        .from('narratives')
        .select('*')
        .eq('user_id', userId);

      if (query.start_date) {
        dbQuery = dbQuery.gte('start_date', query.start_date);
      }

      if (query.end_date) {
        dbQuery = dbQuery.lte('end_date', query.end_date);
      }

      if (query.type) {
        dbQuery = dbQuery.eq('type', query.type);
      }

      if (query.theme) {
        dbQuery = dbQuery.contains('themes', [query.theme]);
      }

      if (query.character) {
        dbQuery = dbQuery.contains('characters', [query.character]);
      }

      const { data, error } = await dbQuery.order('start_date', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to query narratives');
        return [];
      }

      let narratives = (data || []) as Narrative[];

      // Filter by entry count if specified
      if (query.min_entries) {
        narratives = narratives.filter(n => n.entry_ids.length >= query.min_entries!);
      }

      if (query.max_entries) {
        narratives = narratives.filter(n => n.entry_ids.length <= query.max_entries!);
      }

      return narratives;
    } catch (error) {
      logger.error({ error }, 'Failed to query narratives');
      return [];
    }
  }

  /**
   * Update narrative status
   */
  async updateStatus(
    narrativeId: string,
    status: NarrativeStatus
  ): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('narratives')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', narrativeId);

      if (error) {
        logger.error({ error, narrativeId }, 'Failed to update narrative status');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, narrativeId }, 'Failed to update narrative status');
      return false;
    }
  }

  /**
   * Get narrative statistics
   */
  async getStats(userId: string): Promise<NarrativeStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('narratives')
        .select('type, status, segments, start_date, end_date, themes, characters')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_narratives: 0,
          by_type: {} as Record<NarrativeType, number>,
          by_status: {} as Record<NarrativeStatus, number>,
          average_segments: 0,
          average_length_days: 0,
          most_common_themes: [],
          most_common_characters: [],
        };
      }

      const stats: NarrativeStats = {
        total_narratives: data.length,
        by_type: {} as Record<NarrativeType, number>,
        by_status: {} as Record<NarrativeStatus, number>,
        average_segments: 0,
        average_length_days: 0,
        most_common_themes: [],
        most_common_characters: [],
      };

      // Count by type and status
      data.forEach(n => {
        stats.by_type[n.type as NarrativeType] = (stats.by_type[n.type as NarrativeType] || 0) + 1;
        stats.by_status[n.status as NarrativeStatus] = (stats.by_status[n.status as NarrativeStatus] || 0) + 1;
      });

      // Calculate averages
      if (data.length > 0) {
        const totalSegments = data.reduce((sum, n) => sum + (n.segments?.length || 0), 0);
        stats.average_segments = totalSegments / data.length;

        const durations = data
          .filter(n => n.start_date && n.end_date)
          .map(n => {
            const start = new Date(n.start_date);
            const end = new Date(n.end_date);
            return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          });

        if (durations.length > 0) {
          stats.average_length_days = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        }
      }

      // Extract most common themes and characters
      const themeCounts = new Map<string, number>();
      const charCounts = new Map<string, number>();

      data.forEach(n => {
        (n.themes || []).forEach(theme => {
          themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
        });
        (n.characters || []).forEach(char => {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        });
      });

      stats.most_common_themes = Array.from(themeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme);

      stats.most_common_characters = Array.from(charCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([char]) => char);

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get narrative stats');
      return {
        total_narratives: 0,
        by_type: {} as Record<NarrativeType, number>,
        by_status: {} as Record<NarrativeStatus, number>,
        average_segments: 0,
        average_length_days: 0,
        most_common_themes: [],
        most_common_characters: [],
      };
    }
  }
}

