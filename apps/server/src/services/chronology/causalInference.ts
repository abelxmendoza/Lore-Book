import type { TemporalGraph, CausalChain } from './types';

/**
 * Causal inference using longest path in DAG algorithm
 */
export class CausalInference {
  /**
   * Infer causal chains from temporal graph
   */
  infer(graph: TemporalGraph): CausalChain[] {
    const chains: CausalChain[] = [];

    // Build adjacency list for causal edges only
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize in-degree map
    graph.nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    });

    // Build adjacency list from causal edges
    graph.edges
      .filter(e => e.relation === 'causes')
      .forEach(e => {
        if (!adj.has(e.source)) {
          adj.set(e.source, []);
        }
        adj.get(e.source)!.push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      });

    // Find root nodes (nodes with in-degree 0)
    const roots: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        roots.push(nodeId);
      }
    });

    // If no roots, try to find nodes with minimal in-degree
    if (roots.length === 0) {
      let minDegree = Infinity;
      inDegree.forEach((degree, nodeId) => {
        if (degree < minDegree) {
          minDegree = degree;
          roots.length = 0;
          roots.push(nodeId);
        } else if (degree === minDegree) {
          roots.push(nodeId);
        }
      });
    }

    // Find longest path from each root
    for (const root of roots) {
      const chain = this.findLongestPath(root, adj, graph);
      if (chain.length > 1) {
        chains.push({
          rootEvent: root,
          chain,
          confidence: this.calculateConfidence(chain, graph),
          metadata: {
            chainLength: chain.length,
            totalNodes: graph.nodes.length,
          },
        });
      }
    }

    // Also find chains from nodes that have causal edges but aren't roots
    const processed = new Set<string>();
    roots.forEach(r => processed.add(r));

    graph.nodes.forEach(node => {
      if (!processed.has(node.id)) {
        const chain = this.findLongestPath(node.id, adj, graph);
        if (chain.length > 1) {
          chains.push({
            rootEvent: node.id,
            chain,
            confidence: this.calculateConfidence(chain, graph),
            metadata: {
              chainLength: chain.length,
              totalNodes: graph.nodes.length,
            },
          });
        }
      }
    });

    // Sort chains by confidence (descending)
    return chains.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find longest path from a node using DFS
   */
  private findLongestPath(
    startNode: string,
    adj: Map<string, string[]>,
    graph: TemporalGraph
  ): string[] {
    const visited = new Set<string>();
    let longestPath: string[] = [];

    const dfs = (node: string, path: string[]): void => {
      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      const currentPath = [...path, node];

      if (currentPath.length > longestPath.length) {
        longestPath = currentPath;
      }

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, currentPath);
        }
      }

      visited.delete(node);
    };

    dfs(startNode, []);
    return longestPath;
  }

  /**
   * Calculate confidence for a causal chain
   */
  private calculateConfidence(chain: string[], graph: TemporalGraph): number {
    if (chain.length < 2) return 0;

    // Base confidence from chain length
    const lengthConfidence = Math.min(1.0, chain.length / graph.nodes.length);

    // Boost confidence if chain covers significant portion of graph
    const coverageConfidence = chain.length / Math.max(1, graph.nodes.length);

    // Average edge confidence along the chain
    let edgeConfidenceSum = 0;
    let edgeCount = 0;

    for (let i = 0; i < chain.length - 1; i++) {
      const edge = graph.edges.find(
        e => e.source === chain[i] && e.target === chain[i + 1] && e.relation === 'causes'
      );
      if (edge) {
        edgeConfidenceSum += edge.confidence;
        edgeCount++;
      }
    }

    const avgEdgeConfidence = edgeCount > 0 ? edgeConfidenceSum / edgeCount : 0.5;

    // Combine confidences
    return (lengthConfidence * 0.3 + coverageConfidence * 0.3 + avgEdgeConfidence * 0.4);
  }
}

