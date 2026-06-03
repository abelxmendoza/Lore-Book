import { logger } from '../../logger';
import type { SocialEdge } from './types';

/**
 * Centrality Calculator — PageRank
 *
 * Replaces weighted degree centrality with PageRank (Brin & Page, 1998).
 *
 * Degree centrality only counts direct connections. PageRank propagates importance
 * transitively: a node connected to highly-connected nodes scores higher than a
 * node with the same degree but connected to peripheral nodes.
 *
 * For LoreBook's social graph this means:
 *   - Someone who bridges multiple social circles (connector) scores higher
 *   - Someone mentioned by already-central people scores higher
 *   - Pure mention frequency (degree) no longer dominates
 *
 * Algorithm: standard power iteration with damping factor α = 0.85.
 *
 *   r_new[v] = (1-α)/N + α * Σ_{u→v} r[u] / out_degree(u)
 *
 * Converges when L1 norm change < 1e-6, or after 100 iterations.
 */
export class CentralityCalculator {
  private readonly alpha = 0.85;
  private readonly maxIter = 100;
  private readonly tolerance = 1e-6;

  compute(edges: SocialEdge[]): Record<string, number> {
    try {
      if (edges.length === 0) return {};

      // Build weighted adjacency (directed: source → target)
      const adj = new Map<string, Map<string, number>>();
      const nodeSet = new Set<string>();

      for (const e of edges) {
        nodeSet.add(e.source);
        nodeSet.add(e.target);
        const w = Math.max(0.001, e.weight ?? 1);

        // Undirected: add both directions
        if (!adj.has(e.source)) adj.set(e.source, new Map());
        adj.get(e.source)!.set(e.target, (adj.get(e.source)!.get(e.target) ?? 0) + w);
        if (!adj.has(e.target)) adj.set(e.target, new Map());
        adj.get(e.target)!.set(e.source, (adj.get(e.target)!.get(e.source) ?? 0) + w);
      }

      const nodes = [...nodeSet];
      const N = nodes.length;
      if (N === 0) return {};

      // Weighted out-degree
      const outDeg = new Map<string, number>();
      for (const id of nodes) {
        const neighbors = adj.get(id);
        outDeg.set(id, neighbors ? [...neighbors.values()].reduce((s, w) => s + w, 0) : 0);
      }

      // Initialize uniform rank
      let r = new Map<string, number>();
      nodes.forEach(id => r.set(id, 1 / N));

      for (let iter = 0; iter < this.maxIter; iter++) {
        const rNew = new Map<string, number>();
        nodes.forEach(id => rNew.set(id, (1 - this.alpha) / N));

        for (const from of nodes) {
          const deg = outDeg.get(from) ?? 0;
          if (deg === 0) continue; // dangling — teleport only
          const rFrom = r.get(from) ?? 0;
          for (const [to, w] of adj.get(from) ?? new Map()) {
            rNew.set(to, (rNew.get(to) ?? 0) + this.alpha * rFrom * (w / deg));
          }
        }

        // L1 convergence check
        let l1 = 0;
        for (const id of nodes) l1 += Math.abs((rNew.get(id) ?? 0) - (r.get(id) ?? 0));
        r = rNew;
        if (l1 < this.tolerance) break;
      }

      // Normalize to [0, 1]
      const maxR = Math.max(...r.values(), 1e-10);
      const result: Record<string, number> = {};
      for (const [id, score] of r) result[id] = score / maxR;

      logger.debug({ nodes: N }, 'PageRank centrality computed');
      return result;
    } catch (error) {
      logger.error({ error }, 'PageRank centrality failed');
      return {};
    }
  }

  getMostCentral(
    centrality: Record<string, number>,
    topN: number = 10,
  ): Array<{ person: string; centrality: number }> {
    return Object.entries(centrality)
      .map(([person, score]) => ({ person, centrality: score }))
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, topN);
  }
}
