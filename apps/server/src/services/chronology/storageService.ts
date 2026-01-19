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
   * Save gaps (store in metadata or separate table if needed)
   */
  async saveGaps(userId: string, gaps: Gap[]): Promise<void> {
    if (gaps.length === 0) return;

    // Store gaps in user metadata or a dedicated table
    // For now, we'll log them - can be extended to store in a gaps table
    logger.debug({ userId, gapCount: gaps.length }, 'Saving temporal gaps');
    
    // TODO: Create gaps table if needed, or store in user metadata
    // This is a placeholder for future implementation
  }

  /**
   * Save causal chains (store in metadata or separate table if needed)
   */
  async saveCausalChains(userId: string, chains: CausalChain[]): Promise<void> {
    if (chains.length === 0) return;

    // Store chains in metadata or a dedicated table
    logger.debug({ userId, chainCount: chains.length }, 'Saving causal chains');
    
    // TODO: Create causal_chains table if needed, or store in insights table
    // This is a placeholder for future implementation
  }

  /**
   * Save complete chronology result
   */
  async saveChronologyResult(
    userId: string,
    result: ChronologyResult
  ): Promise<void> {
    try {
      // Save temporal edges if we have component ID mappings
      // This would require fetching component IDs from events
      // For now, we'll just log the result
      logger.debug(
        {
          userId,
          eventCount: result.graph.nodes.length,
          edgeCount: result.graph.edges.length,
          chainCount: result.causalChains.length,
          gapCount: result.gaps.length,
        },
        'Saving chronology result'
      );

      // TODO: Implement full persistence logic
      // This could involve:
      // 1. Saving temporal edges to graph_edges
      // 2. Saving gaps to a gaps table
      // 3. Saving causal chains to insights or a chains table
      // 4. Storing patterns in insights table
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save chronology result');
    }
  }
}

export const chronologyStorageService = new ChronologyStorageService();

