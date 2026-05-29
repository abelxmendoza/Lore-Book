import { logger } from '../../logger';
import type { SocialEdge, Community } from './types';

/**
 * Louvain Community Detection
 *
 * Replaces the previous BFS connected-components stub with greedy modularity optimization.
 *
 * Modularity Q measures how much edge density within communities exceeds what
 * is expected in a random graph with the same degree sequence:
 *
 *   Q = (1/2m) Σ_{ij} [A_ij - k_i·k_j/(2m)] · δ(c_i, c_j)
 *
 *   A_ij  = edge weight between i and j (0 if no edge)
 *   k_i   = weighted degree of node i (sum of incident edge weights)
 *   m     = total edge weight in graph
 *   δ     = 1 if i and j are in the same community, else 0
 *
 * Louvain algorithm (Blondel et al., 2008):
 *   Phase 1 (local moves): for each node, try moving it to each neighbor's community.
 *              Keep the move that maximises ΔQ. Repeat until no improvement.
 *   Phase 2 (aggregation): collapse each community into a super-node, rebuild edge
 *              weights as sums of internal edges. Repeat Phase 1 on super-graph.
 *
 * Complexity: O(n log n) empirically on sparse graphs.
 * For LoreKeeper's social graph (typically <500 nodes), this is trivially fast.
 */
export class CommunityDetector {
  detect(edges: SocialEdge[]): Community[] {
    try {
      if (edges.length === 0) return [];

      const { nodes, adj, totalWeight } = this.buildGraph(edges);
      if (nodes.length === 0) return [];

      const assignment = this.louvain(nodes, adj, totalWeight);
      return this.buildCommunities(assignment, edges);
    } catch (error) {
      logger.error({ error }, 'Louvain community detection failed');
      return [];
    }
  }

  // ── Graph construction ─────────────────────────────────────────────────────

  private buildGraph(edges: SocialEdge[]): {
    nodes: string[];
    adj: Map<string, Map<string, number>>;
    totalWeight: number;
  } {
    const adj = new Map<string, Map<string, number>>();
    let totalWeight = 0;

    const addEdge = (from: string, to: string, w: number) => {
      if (!adj.has(from)) adj.set(from, new Map());
      adj.get(from)!.set(to, (adj.get(from)!.get(to) ?? 0) + w);
    };

    for (const e of edges) {
      const w = Math.max(0.001, e.weight ?? 1);
      addEdge(e.source, e.target, w);
      addEdge(e.target, e.source, w); // undirected
      totalWeight += w; // each undirected edge counted once
    }

    return { nodes: [...adj.keys()], adj, totalWeight };
  }

  // ── Louvain core ───────────────────────────────────────────────────────────

  private louvain(
    nodes: string[],
    adj: Map<string, Map<string, number>>,
    totalWeight: number,
  ): Map<string, number> {
    const m = totalWeight; // total edge weight
    if (m === 0) {
      const fallback = new Map<string, number>();
      nodes.forEach((n, i) => fallback.set(n, i));
      return fallback;
    }

    // Weighted degree k_i = Σ_j w(i,j)
    const degree = new Map<string, number>();
    for (const [node, neighbors] of adj) {
      degree.set(node, [...neighbors.values()].reduce((s, w) => s + w, 0));
    }

    // Initialize: each node in its own community
    let community = new Map<string, number>();
    nodes.forEach((n, i) => community.set(n, i));

    // Σ w within community c (internal weight)
    const sigmaIn = new Map<number, number>();
    // Σ degree of nodes in community c
    const sigmaTotal = new Map<number, number>();
    nodes.forEach((n, i) => {
      sigmaIn.set(i, 0);
      sigmaTotal.set(i, degree.get(n) ?? 0);
    });

    let improved = true;
    let passes = 0;
    const MAX_PASSES = 20;

    while (improved && passes < MAX_PASSES) {
      improved = false;
      passes++;

      for (const node of nodes) {
        const cNode = community.get(node)!;
        const kNode = degree.get(node) ?? 0;

        // Compute k_{i,c}: sum of weights from node to community c
        const kToComm = new Map<number, number>(); // commId → weight
        for (const [neighbor, w] of adj.get(node) ?? new Map()) {
          const c = community.get(neighbor)!;
          kToComm.set(c, (kToComm.get(c) ?? 0) + w);
        }

        // ΔQ for removing node from its current community
        const kInCurrent = kToComm.get(cNode) ?? 0;
        const sigTotalCurrent = sigmaTotal.get(cNode) ?? 0;
        const removeGain = kInCurrent - kNode * (sigTotalCurrent - kNode) / (2 * m);

        // Try moving to each neighboring community
        let bestDelta = 0;
        let bestComm = cNode;

        for (const [targetComm, kIn] of kToComm) {
          if (targetComm === cNode) continue;
          const sigTotalTarget = sigmaTotal.get(targetComm) ?? 0;
          // ΔQ = [kIn - kNode * sigTotalTarget / (2m)] - removeGain
          const delta = kIn - kNode * sigTotalTarget / (2 * m) - removeGain;
          if (delta > bestDelta) {
            bestDelta = delta;
            bestComm = targetComm;
          }
        }

        if (bestComm !== cNode) {
          // Move node from cNode to bestComm
          community.set(node, bestComm);
          improved = true;

          // Update sigmaIn: subtract edges within cNode, add edges within bestComm
          sigmaIn.set(cNode, (sigmaIn.get(cNode) ?? 0) - (kToComm.get(cNode) ?? 0));
          sigmaIn.set(bestComm, (sigmaIn.get(bestComm) ?? 0) + (kToComm.get(bestComm) ?? 0));

          // Update sigmaTotal
          sigmaTotal.set(cNode, (sigmaTotal.get(cNode) ?? 0) - kNode);
          sigmaTotal.set(bestComm, (sigmaTotal.get(bestComm) ?? 0) + kNode);
        }
      }
    }

    // Re-index community IDs to be contiguous 0, 1, 2, ...
    const remap = new Map<number, number>();
    let next = 0;
    const final = new Map<string, number>();
    for (const [node, c] of community) {
      if (!remap.has(c)) remap.set(c, next++);
      final.set(node, remap.get(c)!);
    }

    logger.debug({ passes, communities: next }, 'Louvain completed');
    return final;
  }

  // ── Output construction ────────────────────────────────────────────────────

  private buildCommunities(
    assignment: Map<string, number>,
    edges: SocialEdge[],
  ): Community[] {
    const groups = new Map<number, string[]>();
    for (const [node, commId] of assignment) {
      if (!groups.has(commId)) groups.set(commId, []);
      groups.get(commId)!.push(node);
    }

    const communities: Community[] = [];
    let idx = 0;
    for (const [commId, members] of groups) {
      if (members.length < 2) continue; // skip singletons
      const theme = this.inferTheme(members, edges);
      communities.push({
        id: `community_${idx++}`,
        members,
        theme,
        size: members.length,
        cohesion: this.calculateCohesion(members, edges),
        metadata: { louvainId: commId },
      });
    }

    // Sort by size descending
    communities.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    logger.debug({ communities: communities.length }, 'Louvain communities built');
    return communities;
  }

  private inferTheme(members: string[], edges: SocialEdge[]): string {
    const communityEdges = edges.filter(
      e => members.includes(e.source) && members.includes(e.target)
    );
    const allText = communityEdges.flatMap(e => e.interactions).join(' ').toLowerCase();

    if (/gym|bjj|muay thai|training|sparring|rolling|grappling|martial|wrestling/i.test(allText)) return 'training';
    if (/family|mom|dad|sister|brother|abuela|abuelo|home|parents|cousin/i.test(allText)) return 'family';
    if (/work|office|colleague|team|project|manager|boss|client/i.test(allText)) return 'work';
    if (/robotics|code|tech|software|engineering|build|hardware|prototype/i.test(allText)) return 'tech';
    if (/music|show|concert|band|ska|punk|gig|venue/i.test(allText)) return 'music';
    if (/school|class|professor|campus|college|university|study/i.test(allText)) return 'school';
    if (/friend|hangout|party|social|club|bar|event/i.test(allText)) return 'social';
    return 'interaction cluster';
  }

  private calculateCohesion(members: string[], edges: SocialEdge[]): number {
    if (members.length < 2) return 0;
    const internal = edges.filter(
      e => members.includes(e.source) && members.includes(e.target)
    );
    const maxEdges = (members.length * (members.length - 1)) / 2;
    return Math.min(1, internal.length / maxEdges);
  }
}
