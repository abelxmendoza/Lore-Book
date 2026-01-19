import { logger } from '../../logger';

import type { SocialEdge } from './types';

/**
 * Calculates centrality (importance) of nodes in the network
 * Uses degree centrality (number of connections)
 */
export class CentralityCalculator {
  /**
   * Compute centrality for all nodes
   */
  compute(edges: SocialEdge[]): Record<string, number> {
    const centrality: Record<string, number> = {};

    try {
      // Count edges per node (degree centrality)
      for (const edge of edges) {
        // Initialize if not exists
        if (!centrality[edge.source]) {
          centrality[edge.source] = 0;
        }
        if (!centrality[edge.target]) {
          centrality[edge.target] = 0;
        }

        // Add edge weight to centrality
        centrality[edge.source] += edge.weight;
        centrality[edge.target] += edge.weight;
      }

      // Normalize by max centrality (optional)
      const maxCentrality = Math.max(...Object.values(centrality), 1);
      if (maxCentrality > 0) {
        for (const person of Object.keys(centrality)) {
          centrality[person] = centrality[person] / maxCentrality;
        }
      }

      logger.debug({ nodes: Object.keys(centrality).length }, 'Computed centrality');

      return centrality;
    } catch (error) {
      logger.error({ error }, 'Failed to compute centrality');
      return {};
    }
  }

  /**
   * Get most central nodes
   */
  getMostCentral(centrality: Record<string, number>, topN: number = 10): Array<{ person: string; centrality: number }> {
    return Object.entries(centrality)
      .map(([person, score]) => ({ person, centrality: score }))
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, topN);
  }
}

