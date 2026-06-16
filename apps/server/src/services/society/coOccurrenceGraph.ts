// =====================================================
// CO-OCCURRENCE GRAPH
// Purpose: Track which characters are talked about together, weighted by how
//          many DISTINCT contexts (conversations / journal entries) they share.
//          Cross-session by construction: two people mentioned in different
//          conversations still accumulate edge weight.
//
// Pure data structure (no I/O) so it is trivially unit-testable.
// =====================================================

interface Edge {
  a: string;
  b: string;
  weight: number; // number of distinct contexts the pair co-occurred in
  contexts: Set<string>;
}

// Memory bounds (OOM guard — see docs/oom-root-cause-report.md). Edge count is
// O(nodes²) and node identity comes from noisy name extraction, so an unbounded
// run can build a multi-GB graph. These caps make a single run's footprint
// bounded without changing results for normal-sized histories.
const MAX_IDS_PER_CONTEXT = 30;   // a context with more "names" than this is noise
const MAX_NODES = 2_000;          // once reached, only existing nodes accrue edges
const MAX_EDGES = 200_000;        // hard ceiling on the edge map

export class CoOccurrenceGraph {
  private nodes = new Set<string>();
  private edges = new Map<string, Edge>();
  private capped = false;

  /** True if this run hit a memory cap and stopped growing the graph. */
  isCapped(): boolean {
    return this.capped;
  }

  private static edgeKey(a: string, b: string): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  /** Register one context: every distinct pair among `ids` gains weight (once per context). */
  addContext(ids: string[], contextId: string): void {
    // Truncate pathologically large contexts (noise) so one context can't add O(n²) edges.
    const uniq = [...new Set(ids.filter(Boolean))].slice(0, MAX_IDS_PER_CONTEXT);
    for (const id of uniq) {
      // Stop registering NEW nodes at the cap; known nodes still accrue edges.
      if (this.nodes.size >= MAX_NODES && !this.nodes.has(id)) { this.capped = true; continue; }
      this.nodes.add(id);
    }
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        // Only pair nodes that were actually registered (respects the node cap).
        if (!this.nodes.has(uniq[i]) || !this.nodes.has(uniq[j])) continue;
        const key = CoOccurrenceGraph.edgeKey(uniq[i], uniq[j]);
        if (!this.edges.has(key) && this.edges.size >= MAX_EDGES) { this.capped = true; continue; }
        const edge = this.edges.get(key) ?? { a: uniq[i], b: uniq[j], weight: 0, contexts: new Set() };
        if (!edge.contexts.has(contextId)) {
          edge.contexts.add(contextId);
          edge.weight += 1;
        }
        this.edges.set(key, edge);
      }
    }
  }

  edgeWeight(a: string, b: string): number {
    return this.edges.get(CoOccurrenceGraph.edgeKey(a, b))?.weight ?? 0;
  }

  /** All edges (weight >= 1). */
  edgeList(): Array<{ a: string; b: string; weight: number }> {
    return [...this.edges.values()].map(e => ({ a: e.a, b: e.b, weight: e.weight }));
  }

  /**
   * Communities of co-mentioned people.
   *
   * Two-stage, cheap, deterministic:
   *  1. Keep only STRONG edges — recurring (weight >= 2) or part of a TRIANGLE
   *     (endpoints share a common neighbor). This drops one-off chains.
   *  2. Run label propagation over the strong-edge subgraph. Label propagation
   *     lets two dense cliques that happen to share a single bridge edge settle
   *     into SEPARATE communities (each node keeps the label of its denser
   *     side), instead of collapsing into one giant blob the way plain
   *     connected-components would.
   */
  communities(): string[][] {
    const adj = new Map<string, Set<string>>();
    const addAdj = (x: string, y: string) => {
      (adj.get(x) ?? adj.set(x, new Set()).get(x)!).add(y);
    };
    for (const e of this.edges.values()) { addAdj(e.a, e.b); addAdj(e.b, e.a); }

    // Strong-edge adjacency (weighted).
    const strongAdj = new Map<string, Map<string, number>>();
    const link = (x: string, y: string, w: number) => {
      const m = strongAdj.get(x) ?? strongAdj.set(x, new Map()).get(x)!;
      m.set(y, w);
    };
    for (const e of this.edges.values()) {
      let strong = e.weight >= 2;
      if (!strong) {
        const na = adj.get(e.a)!; const nb = adj.get(e.b)!;
        for (const x of na) { if (x !== e.b && nb.has(x)) { strong = true; break; } }
      }
      if (strong) { link(e.a, e.b, e.weight); link(e.b, e.a, e.weight); }
    }

    const nodes = [...strongAdj.keys()].sort();
    if (nodes.length === 0) return [];

    // Label propagation.
    const label = new Map<string, string>();
    for (const n of nodes) label.set(n, n);
    for (let iter = 0; iter < 12; iter++) {
      let changed = false;
      for (const node of nodes) {
        const weights = new Map<string, number>();
        for (const [nbr, w] of strongAdj.get(node)!) {
          const l = label.get(nbr)!;
          weights.set(l, (weights.get(l) ?? 0) + w);
        }
        if (weights.size === 0) continue;
        let best = label.get(node)!;
        let bestW = -1;
        for (const [l, w] of [...weights].sort((p, q) => (p[0] < q[0] ? -1 : 1))) {
          if (w > bestW) { bestW = w; best = l; }
        }
        if (best !== label.get(node)) { label.set(node, best); changed = true; }
      }
      if (!changed) break;
    }

    const groups = new Map<string, string[]>();
    for (const node of nodes) {
      const l = label.get(node)!;
      (groups.get(l) ?? groups.set(l, []).get(l)!).push(node);
    }
    return [...groups.values()].filter(c => c.length >= 2);
  }

  /** Neighbors of `id` reachable by an edge of at least `minWeight`. */
  neighbors(id: string, minWeight = 1): string[] {
    const out: string[] = [];
    for (const edge of this.edges.values()) {
      if (edge.weight < minWeight) continue;
      if (edge.a === id) out.push(edge.b);
      else if (edge.b === id) out.push(edge.a);
    }
    return out;
  }

  /**
   * Connected components using only edges with weight >= minWeight.
   * Singletons (nodes with no qualifying edge) are omitted.
   */
  components(minWeight = 1): string[][] {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let cur = x;
      while (parent.get(cur) !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
      return root;
    };
    const union = (x: string, y: string) => {
      parent.set(find(x), find(y));
    };

    for (const node of this.nodes) if (!parent.has(node)) parent.set(node, node);
    for (const edge of this.edges.values()) {
      if (edge.weight < minWeight) continue;
      union(edge.a, edge.b);
    }

    const groups = new Map<string, string[]>();
    for (const edge of this.edges.values()) {
      if (edge.weight < minWeight) continue;
      for (const id of [edge.a, edge.b]) {
        const root = find(id);
        const list = groups.get(root) ?? [];
        if (!list.includes(id)) list.push(id);
        groups.set(root, list);
      }
    }
    return [...groups.values()].filter(c => c.length >= 2);
  }

  get nodeCount(): number {
    return this.nodes.size;
  }
}
