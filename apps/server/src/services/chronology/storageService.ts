import { v4 as uuid } from 'uuid';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { TemporalEdge, Gap, CausalChain, ChronologyResult } from './types';

/**
 * Storage service for chronology results
 */
export class ChronologyStorageService {
  /**
   * Save temporal edges to graph_edges table
   */
  async saveTemporalEdges(
    edges: TemporalEdge[],
    componentIdMap: Map<string, string>
  ): Promise<void> {
    if (edges.length === 0) return;

    const graphEdges = edges
      .map(edge => {
        const sourceComponentId = componentIdMap.get(edge.source);
        const targetComponentId = componentIdMap.get(edge.target);

        if (!sourceComponentId || !targetComponentId) {
          return null;
        }

        return {
          id: uuid(),
          source_component_id: sourceComponentId,
          target_component_id: targetComponentId,
          relationship_type: 'temporal' as const,
          weight: edge.confidence,
          metadata: {
            ...edge.metadata,
            temporal_relation: edge.relation,
          },
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (graphEdges.length === 0) return;

    // Batch insert
    const batchSize = 100;
    for (let i = 0; i < graphEdges.length; i += batchSize) {
      const batch = graphEdges.slice(i, i + batchSize);

      const { error } = await supabaseAdmin.from('graph_edges').insert(batch);

      if (error) {
        // If unique constraint violation, edge already exists (skip)
        if (error.code === '23505') {
          logger.debug({ error }, 'Temporal edge already exists, skipping');
          continue;
        }
        logger.error({ error }, 'Failed to save temporal edges');
      }
    }
  }

  /**
   * Get temporal graph for a component
   */
  async getTemporalGraph(componentId: string): Promise<TemporalEdge[]> {
    const { data, error } = await supabaseAdmin
      .from('graph_edges')
      .select('*')
      .or(`source_component_id.eq.${componentId},target_component_id.eq.${componentId}`)
      .eq('relationship_type', 'temporal');

    if (error) {
      logger.error({ error, componentId }, 'Failed to fetch temporal graph');
      return [];
    }

    return (data || []).map(edge => ({
      source: edge.source_component_id,
      target: edge.target_component_id,
      relation: (edge.metadata as any)?.temporal_relation || 'before',
      confidence: edge.weight,
      metadata: edge.metadata,
    }));
  }

  /**
   * Save gaps to chronology_snapshots (merged into saveChronologyResult)
   */
  async saveGaps(userId: string, gaps: Gap[]): Promise<void> {
    // Persisted as part of saveChronologyResult — no standalone table needed
    logger.debug({ userId, gapCount: gaps.length }, 'chronology: gaps noted');
  }

  /**
   * Save causal chains (merged into saveChronologyResult)
   */
  async saveCausalChains(userId: string, chains: CausalChain[]): Promise<void> {
    logger.debug({ userId, chainCount: chains.length }, 'chronology: chains noted');
  }

  /**
   * Persist a full chronology result snapshot to chronology_snapshots.
   * One row per user per run — upsert on user_id so we keep the latest.
   */
  async saveChronologyResult(userId: string, result: ChronologyResult): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('chronology_snapshots')
        .upsert(
          {
            user_id: userId,
            node_count: result.graph.nodes.length,
            edge_count: result.graph.edges.length,
            gap_count: result.gaps.length,
            chain_count: result.causalChains.length,
            pattern_count: result.patterns.length,
            gaps: result.gaps,
            causal_chains: result.causalChains,
            patterns: result.patterns,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      logger.info(
        {
          userId,
          nodes: result.graph.nodes.length,
          edges: result.graph.edges.length,
          gaps: result.gaps.length,
          chains: result.causalChains.length,
        },
        'chronology: snapshot saved'
      );
    } catch (error) {
      logger.error({ error, userId }, 'chronology: failed to save snapshot');
    }
  }
}

export const chronologyStorageService = new ChronologyStorageService();

