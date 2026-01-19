import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  CreativeEvent,
  FlowState,
  CreativeBlock,
  InspirationSource,
  ProjectLifecycle,
  CreativeScore,
  CreativeInsight,
  CreativeMedium,
  CreativeBlockType,
  CreativeStats,
} from './types';

/**
 * Handles storage and retrieval of creative data
 */
export class CreativeStorage {
  /**
   * Save creative events
   */
  async saveCreativeEvents(events: CreativeEvent[]): Promise<CreativeEvent[]> {
    if (events.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_events')
        .insert(
          events.map(e => ({
            user_id: e.user_id,
            timestamp: e.timestamp,
            medium: e.medium,
            action: e.action,
            description: e.description,
            entry_id: e.entry_id,
            metadata: e.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save creative events');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved creative events');
      return (data || []) as CreativeEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to save creative events');
      return [];
    }
  }

  /**
   * Save flow states
   */
  async saveFlowStates(states: FlowState[]): Promise<FlowState[]> {
    if (states.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('flow_states')
        .insert(
          states.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            level: s.level,
            indicators: s.indicators,
            medium: s.medium,
            duration_minutes: s.duration_minutes,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save flow states');
        return [];
      }

      return (data || []) as FlowState[];
    } catch (error) {
      logger.error({ error }, 'Failed to save flow states');
      return [];
    }
  }

  /**
   * Save creative blocks
   */
  async saveCreativeBlocks(blocks: CreativeBlock[]): Promise<CreativeBlock[]> {
    if (blocks.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_blocks')
        .insert(
          blocks.map(b => ({
            user_id: b.user_id,
            timestamp: b.timestamp,
            type: b.type,
            evidence: b.evidence,
            confidence: b.confidence,
            medium: b.medium,
            resolved: b.resolved || false,
            resolved_at: b.resolved_at,
            metadata: b.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save creative blocks');
        return [];
      }

      return (data || []) as CreativeBlock[];
    } catch (error) {
      logger.error({ error }, 'Failed to save creative blocks');
      return [];
    }
  }

  /**
   * Save inspiration sources
   */
  async saveInspirationSources(sources: InspirationSource[]): Promise<InspirationSource[]> {
    if (sources.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('inspiration_sources')
        .insert(
          sources.map(s => ({
            user_id: s.user_id,
            timestamp: s.timestamp,
            type: s.type,
            evidence: s.evidence,
            weight: s.weight,
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save inspiration sources');
        return [];
      }

      return (data || []) as InspirationSource[];
    } catch (error) {
      logger.error({ error }, 'Failed to save inspiration sources');
      return [];
    }
  }

  /**
   * Save project lifecycles
   */
  async saveProjectLifecycles(projects: ProjectLifecycle[]): Promise<ProjectLifecycle[]> {
    if (projects.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('project_lifecycles')
        .insert(
          projects.map(p => ({
            user_id: p.user_id,
            project_name: p.projectName,
            stage: p.stage,
            indicators: p.indicators,
            first_mentioned: p.first_mentioned,
            last_updated: p.last_updated,
            event_count: p.event_count || 0,
            metadata: p.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save project lifecycles');
        return [];
      }

      return (data || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        projectName: p.project_name,
        stage: p.stage,
        indicators: p.indicators,
        first_mentioned: p.first_mentioned,
        last_updated: p.last_updated,
        event_count: p.event_count,
        metadata: p.metadata,
      })) as ProjectLifecycle[];
    } catch (error) {
      logger.error({ error }, 'Failed to save project lifecycles');
      return [];
    }
  }

  /**
   * Save creative score
   */
  async saveCreativeScore(userId: string, score: CreativeScore): Promise<CreativeScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('creative_scores')
        .insert({
          user_id: userId,
          output: score.output,
          consistency: score.consistency,
          flow: score.flow,
          inspiration: score.inspiration,
          overall: score.overall,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save creative score');
        return null;
      }

      return {
        output: data.output,
        consistency: data.consistency,
        flow: data.flow,
        inspiration: data.inspiration,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save creative score');
      return null;
    }
  }

  /**
   * Save creative insights
   */
  async saveInsights(insights: CreativeInsight[]): Promise<CreativeInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            timestamp: i.timestamp,
            confidence: i.confidence,
            medium: i.medium,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save creative insights');
        return [];
      }

      return (data || []) as CreativeInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save creative insights');
      return [];
    }
  }

  /**
   * Get creative events
   */
  async getCreativeEvents(userId: string, medium?: CreativeMedium): Promise<CreativeEvent[]> {
    try {
      let query = supabaseAdmin
        .from('creative_events')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (medium) {
        query = query.eq('medium', medium);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get creative events');
        return [];
      }

      return (data || []) as CreativeEvent[];
    } catch (error) {
      logger.error({ error }, 'Failed to get creative events');
      return [];
    }
  }

  /**
   * Get flow states
   */
  async getFlowStates(userId: string, medium?: CreativeMedium): Promise<FlowState[]> {
    try {
      let query = supabaseAdmin
        .from('flow_states')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (medium) {
        query = query.eq('medium', medium);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get flow states');
        return [];
      }

      return (data || []) as FlowState[];
    } catch (error) {
      logger.error({ error }, 'Failed to get flow states');
      return [];
    }
  }

  /**
   * Get creative blocks
   */
  async getCreativeBlocks(userId: string, type?: CreativeBlockType, resolved?: boolean): Promise<CreativeBlock[]> {
    try {
      let query = supabaseAdmin
        .from('creative_blocks')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      if (resolved !== undefined) {
        query = query.eq('resolved', resolved);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get creative blocks');
        return [];
      }

      return (data || []) as CreativeBlock[];
    } catch (error) {
      logger.error({ error }, 'Failed to get creative blocks');
      return [];
    }
  }

  /**
   * Get latest creative score
   */
  async getLatestCreativeScore(userId: string): Promise<CreativeScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('creative_scores')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        output: data.output,
        consistency: data.consistency,
        flow: data.flow,
        inspiration: data.inspiration,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get creative score');
      return null;
    }
  }

  /**
   * Get creative statistics
   */
  async getStats(userId: string): Promise<CreativeStats> {
    try {
      const { data: events, error: eventError } = await supabaseAdmin
        .from('creative_events')
        .select('medium')
        .eq('user_id', userId);

      const { data: flow, error: flowError } = await supabaseAdmin
        .from('flow_states')
        .select('level')
        .eq('user_id', userId);

      const { data: blocks, error: blockError } = await supabaseAdmin
        .from('creative_blocks')
        .select('type')
        .eq('user_id', userId);

      const { data: projects, error: projectError } = await supabaseAdmin
        .from('project_lifecycles')
        .select('stage')
        .eq('user_id', userId)
        .in('stage', ['seed', 'development', 'execution', 'refinement', 'release']);

      const { data: score, error: scoreError } = await supabaseAdmin
        .from('creative_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (eventError || flowError || blockError || projectError || scoreError) {
        return this.getEmptyStats();
      }

      // Calculate event distribution by medium
      const eventsByMedium: Record<string, number> = {};
      (events || []).forEach(e => {
        eventsByMedium[e.medium] = (eventsByMedium[e.medium] || 0) + 1;
      });

      // Calculate average flow level
      const totalFlow = (flow || []).reduce((sum, f) => sum + (f.level || 0), 0);
      const avgFlow = (flow || []).length > 0 ? totalFlow / flow.length : 0;

      // Calculate block distribution
      const blocksByType: Record<string, number> = {};
      (blocks || []).forEach(b => {
        blocksByType[b.type] = (blocksByType[b.type] || 0) + 1;
      });

      // Top mediums
      const topMediums = Object.entries(eventsByMedium)
        .map(([medium, count]) => ({ medium: medium as CreativeMedium, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total_events: events?.length || 0,
        events_by_medium: eventsByMedium as Record<CreativeMedium, number>,
        total_flow_states: flow?.length || 0,
        average_flow_level: avgFlow,
        total_blocks: blocks?.length || 0,
        blocks_by_type: blocksByType as Record<CreativeBlockType, number>,
        total_inspiration_sources: 0, // Would need to query separately
        creative_score: score?.overall || 0,
        top_mediums: topMediums,
        active_projects: projects?.length || 0,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get creative stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): CreativeStats {
    return {
      total_events: 0,
      events_by_medium: {} as Record<CreativeMedium, number>,
      total_flow_states: 0,
      average_flow_level: 0,
      total_blocks: 0,
      blocks_by_type: {} as Record<CreativeBlockType, number>,
      total_inspiration_sources: 0,
      creative_score: 0,
      top_mediums: [],
      active_projects: 0,
    };
  }
}

