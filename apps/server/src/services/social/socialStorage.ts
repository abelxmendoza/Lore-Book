import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  SocialNode,
  SocialEdge,
  Community,
  InfluenceScore,
  ToxicitySignal,
  DriftEvent,
  NetworkScore,
  SocialInsight,
  SocialStats,
} from './types';

/**
 * Handles storage and retrieval of social network data
 */
export class SocialStorage {
  /**
   * Save social nodes
   */
  async saveNodes(userId: string, nodes: Record<string, SocialNode>): Promise<void> {
    if (Object.keys(nodes).length === 0) return;

    try {
      const nodeData = Object.values(nodes).map(node => ({
        user_id: userId,
        person_name: node.id,
        mentions: node.mentions,
        sentiment: node.sentiment,
        categories: node.categories,
        first_mentioned: node.first_mentioned,
        last_mentioned: node.last_mentioned,
        centrality: node.centrality || 0,
        metadata: node.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('social_nodes')
        .upsert(nodeData, { onConflict: 'user_id,person_name' });

      if (error) {
        logger.error({ error }, 'Failed to save social nodes');
      } else {
        logger.debug({ count: nodeData.length }, 'Saved social nodes');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save social nodes');
    }
  }

  /**
   * Save social edges
   */
  async saveEdges(edges: SocialEdge[]): Promise<void> {
    if (edges.length === 0) return;

    try {
      const edgeData = edges.map(edge => ({
        user_id: edge.user_id,
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        sentiment: edge.sentiment,
        interactions: edge.interactions,
        first_interaction: edge.first_interaction,
        last_interaction: edge.last_interaction,
        metadata: edge.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('social_edges')
        .upsert(edgeData, { onConflict: 'user_id,source,target' });

      if (error) {
        logger.error({ error }, 'Failed to save social edges');
      } else {
        logger.debug({ count: edgeData.length }, 'Saved social edges');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save social edges');
    }
  }

  /**
   * Save communities
   */
  async saveCommunities(communities: Community[]): Promise<void> {
    if (communities.length === 0) return;

    try {
      const communityData = communities.map(comm => ({
        user_id: comm.user_id,
        community_id: comm.id,
        members: comm.members,
        theme: comm.theme,
        cohesion: comm.cohesion || 0,
        size: comm.size || comm.members.length,
        metadata: comm.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('social_communities')
        .upsert(communityData, { onConflict: 'user_id,community_id' });

      if (error) {
        logger.error({ error }, 'Failed to save communities');
      } else {
        logger.debug({ count: communityData.length }, 'Saved communities');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save communities');
    }
  }

  /**
   * Save influence scores
   */
  async saveInfluenceScores(influence: InfluenceScore[]): Promise<void> {
    if (influence.length === 0) return;

    try {
      const influenceData = influence.map(inf => ({
        user_id: inf.user_id,
        person: inf.person,
        score: inf.score,
        factors: inf.factors,
        rank: inf.rank,
        timestamp: inf.timestamp || new Date().toISOString(),
        metadata: inf.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('influence_scores')
        .insert(influenceData);

      if (error) {
        logger.error({ error }, 'Failed to save influence scores');
      } else {
        logger.debug({ count: influenceData.length }, 'Saved influence scores');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save influence scores');
    }
  }

  /**
   * Save toxicity signals
   */
  async saveToxicitySignals(toxic: ToxicitySignal[]): Promise<void> {
    if (toxic.length === 0) return;

    try {
      const toxicData = toxic.map(t => ({
        user_id: t.user_id,
        person: t.person,
        evidence: t.evidence,
        severity: t.severity,
        category: t.category,
        timestamp: t.timestamp || new Date().toISOString(),
        metadata: t.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('toxicity_signals')
        .insert(toxicData);

      if (error) {
        logger.error({ error }, 'Failed to save toxicity signals');
      } else {
        logger.debug({ count: toxicData.length }, 'Saved toxicity signals');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save toxicity signals');
    }
  }

  /**
   * Save drift events
   */
  async saveDriftEvents(drift: DriftEvent[]): Promise<void> {
    if (drift.length === 0) return;

    try {
      const driftData = drift.map(d => ({
        user_id: d.user_id,
        person: d.person,
        trend: d.trend,
        evidence: d.evidence,
        confidence: d.confidence || 0.5,
        timestamp: d.timestamp || new Date().toISOString(),
        metadata: d.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('drift_events')
        .insert(driftData);

      if (error) {
        logger.error({ error }, 'Failed to save drift events');
      } else {
        logger.debug({ count: driftData.length }, 'Saved drift events');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save drift events');
    }
  }

  /**
   * Save network score
   */
  async saveNetworkScore(userId: string, score: NetworkScore): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('network_scores')
        .insert({
          user_id: userId,
          cohesion: score.cohesion,
          stability: score.stability,
          influence_balance: score.influenceBalance,
          toxicity_level: score.toxicityLevel,
          overall: score.overall,
          timestamp: score.timestamp || new Date().toISOString(),
          metadata: {},
        });

      if (error) {
        logger.error({ error }, 'Failed to save network score');
      } else {
        logger.debug('Saved network score');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save network score');
    }
  }

  /**
   * Save insights
   */
  async saveInsights(insights: SocialInsight[]): Promise<void> {
    if (insights.length === 0) return;

    try {
      const insightData = insights.map(i => ({
        user_id: i.user_id,
        type: i.type,
        message: i.message,
        timestamp: i.timestamp,
        confidence: i.confidence,
        person: i.person,
        metadata: i.metadata || {},
      }));

      const { error } = await supabaseAdmin
        .from('social_insights')
        .insert(insightData);

      if (error) {
        logger.error({ error }, 'Failed to save social insights');
      } else {
        logger.debug({ count: insightData.length }, 'Saved social insights');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save social insights');
    }
  }

  /**
   * Get social statistics
   */
  async getStats(userId: string): Promise<SocialStats> {
    try {
      const { data: nodes } = await supabaseAdmin
        .from('social_nodes')
        .select('person_name')
        .eq('user_id', userId);

      const { data: edges } = await supabaseAdmin
        .from('social_edges')
        .select('id')
        .eq('user_id', userId);

      const { data: communities } = await supabaseAdmin
        .from('social_communities')
        .select('id')
        .eq('user_id', userId);

      const { data: toxic } = await supabaseAdmin
        .from('toxicity_signals')
        .select('person, severity')
        .eq('user_id', userId)
        .order('severity', { ascending: false })
        .limit(10);

      const { data: drift } = await supabaseAdmin
        .from('drift_events')
        .select('person, trend')
        .eq('user_id', userId);

      const { data: influence } = await supabaseAdmin
        .from('influence_scores')
        .select('person, score')
        .eq('user_id', userId)
        .order('score', { ascending: false })
        .limit(10);

      const { data: centrality } = await supabaseAdmin
        .from('social_nodes')
        .select('person_name, centrality')
        .eq('user_id', userId)
        .order('centrality', { ascending: false })
        .limit(10);

      const { data: score } = await supabaseAdmin
        .from('network_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      return {
        total_nodes: nodes?.length || 0,
        total_edges: edges?.length || 0,
        total_communities: communities?.length || 0,
        total_toxic_signals: toxic?.length || 0,
        total_drift_events: drift?.length || 0,
        top_influencers: (influence || []).map(i => ({ person: i.person, score: i.score })),
        most_central: (centrality || []).map(c => ({ person: c.person_name, centrality: c.centrality || 0 })),
        network_score: score?.overall || 0,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get social stats');
      return {
        total_nodes: 0,
        total_edges: 0,
        total_communities: 0,
        total_toxic_signals: 0,
        total_drift_events: 0,
        top_influencers: [],
        most_central: [],
        network_score: 0,
      };
    }
  }
}

