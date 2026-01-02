import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  PersonInfluence,
  InfluenceEvent,
  InfluenceInsight,
  InfluenceStats,
} from './types';

/**
 * Handles storage and retrieval of influence data
 */
export class InfluenceStorage {
  /**
   * Save person influence profiles
   */
  async saveProfiles(profiles: PersonInfluence[]): Promise<PersonInfluence[]> {
    if (profiles.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('person_influence')
        .upsert(
          profiles.map(p => ({
            id: p.id,
            user_id: p.user_id,
            person: p.person,
            emotional_impact: p.emotional_impact,
            behavioral_impact: p.behavioral_impact,
            frequency: p.frequency,
            toxicity_score: p.toxicity_score,
            uplift_score: p.uplift_score,
            net_influence: p.net_influence,
            interaction_count: p.interaction_count,
            first_interaction: p.first_interaction,
            last_interaction: p.last_interaction,
            metadata: p.metadata || {},
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: 'user_id,person',
          }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save person influence profiles');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved person influence profiles');
      return (data || []) as PersonInfluence[];
    } catch (error) {
      logger.error({ error }, 'Failed to save person influence profiles');
      return [];
    }
  }

  /**
   * Save influence events
   */
  async saveEvents(events: InfluenceEvent[]): Promise<InfluenceEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('influence_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            person: e.person,
            text: e.text,
            sentiment: e.sentiment,
            behavior_tags: e.behavior_tags || [],
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save influence events');
        return [];
      }

      return (data || []) as InfluenceEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save influence events');
      return [];
    }
  }

  /**
   * Save influence insights
   */
  async saveInsights(insights: InfluenceInsight[]): Promise<InfluenceInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('influence_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            timestamp: i.timestamp,
            confidence: i.confidence,
            person: i.person,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save influence insights');
        return [];
      }

      return (data || []) as InfluenceInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save influence insights');
      return [];
    }
  }

  /**
   * Get person influence profiles
   */
  async getProfiles(userId: string, minNetInfluence?: number): Promise<PersonInfluence[]> {
    try {
      let query = supabaseAdmin
        .from('person_influence')
        .select('*')
        .eq('user_id', userId)
        .order('net_influence', { ascending: false });

      if (minNetInfluence !== undefined) {
        query = query.gte('net_influence', minNetInfluence);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get person influence profiles');
        return [];
      }

      return (data || []) as PersonInfluence[];
    } catch (error) {
      logger.error({ error }, 'Failed to get person influence profiles');
      return [];
    }
  }

  /**
   * Get influence events
   */
  async getEvents(userId: string, person?: string): Promise<InfluenceEvent[]> {
    try {
      let query = supabaseAdmin
        .from('influence_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (person) {
        query = query.eq('person', person);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get influence events');
        return [];
      }

      return (data || []) as InfluenceEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get influence events');
      return [];
    }
  }

  /**
   * Get influence insights
   */
  async getInsights(userId: string, type?: string, person?: string): Promise<InfluenceInsight[]> {
    try {
      let query = supabaseAdmin
        .from('influence_insights')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      if (person) {
        query = query.eq('person', person);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get influence insights');
        return [];
      }

      return (data || []) as InfluenceInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to get influence insights');
      return [];
    }
  }

  /**
   * Get influence statistics
   */
  async getStats(userId: string): Promise<InfluenceStats> {
    try {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('person_influence')
        .select('net_influence, toxicity_score, uplift_score')
        .eq('user_id', userId);

      const { data: events, error: eventsError } = await supabaseAdmin
        .from('influence_events')
        .select('id')
        .eq('user_id', userId);

      if (profilesError || eventsError) {
        return this.getEmptyStats();
      }

      const stats: InfluenceStats = {
        total_people: profiles?.length || 0,
        toxic_people: 0,
        uplifting_people: 0,
        average_net_influence: 0,
        most_positive_influence: null,
        most_negative_influence: null,
        total_interactions: events?.length || 0,
      };

      if (profiles && profiles.length > 0) {
        // Count toxic and uplifting people
        profiles.forEach(p => {
          if (p.toxicity_score >= 0.5) stats.toxic_people++;
          if (p.uplift_score >= 0.5) stats.uplifting_people++;
        });

        // Calculate average net influence
        const totalInfluence = profiles.reduce((sum, p) => sum + (p.net_influence || 0), 0);
        stats.average_net_influence = totalInfluence / profiles.length;

        // Find most positive and negative
        const sorted = [...profiles].sort((a, b) => (b.net_influence || 0) - (a.net_influence || 0));
        if (sorted.length > 0 && sorted[0].net_influence > 0) {
          stats.most_positive_influence = sorted[0].person || null;
        }
        if (sorted.length > 0 && sorted[sorted.length - 1].net_influence < 0) {
          stats.most_negative_influence = sorted[sorted.length - 1].person || null;
        }
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get influence stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): InfluenceStats {
    return {
      total_people: 0,
      toxic_people: 0,
      uplifting_people: 0,
      average_net_influence: 0,
      most_positive_influence: null,
      most_negative_influence: null,
      total_interactions: 0,
    };
  }
}

