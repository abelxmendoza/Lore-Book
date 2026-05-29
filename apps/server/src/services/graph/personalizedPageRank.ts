/**
 * Personalized PageRank (PPR)
 *
 * Standard PageRank ranks nodes by global structural importance.
 * PPR seeds the random walk from a specific set of nodes — the query entities —
 * so scores reflect importance *relative to this query*, not the whole graph.
 *
 * Algorithm: Power iteration with teleportation to seed nodes.
 *
 *   r_new[v] = (1 - α) * p[v] + α * Σ_{u: u→v} r[u] / out_degree(u)
 *
 *   α     = damping factor (probability of following an edge vs. teleporting), typically 0.85
 *   p[v]  = 1/|seeds| if v is a seed node, else 0 (personalization vector)
 *
 * Convergence: when ||r_new - r|| < tolerance (L1 norm), or maxIter reached.
 * Typical: 20-30 iterations on sparse graphs.
 *
 * Time complexity: O(|E| × iterations) — fast for the social/entity graph sizes in LoreKeeper.
 *
 * Usage in LoreKeeper:
 *   - Seed on entities extracted from the user's current query (Sol, Genni, etc.)
 *   - All nodes connected to those entities (via entity_mentions adjacency) get scored
 *   - Top-k PPR nodes identify the most contextually relevant memory entries to surface
 */

export interface PPRGraph {
  /** All node IDs in the graph */
  nodes: string[];
  /** Adjacency list: nodeId → list of neighbor nodeIds */
  edges: Map<string, string[]>;
  /** Optional edge weights (default 1.0 for unweighted) */
  weights?: Map<string, Map<string, number>>;
}

export interface PPRResult {
  /** node ID → PPR score (sums to ~1 over all nodes) */
  scores: Map<string, number>;
  /** Nodes sorted descending by score */
  ranked: Array<{ id: string; score: number }>;
  iterations: number;
  converged: boolean;
}

/**
 * Compute Personalized PageRank scores over a graph seeded on seedNodeIds.
 *
 * @param graph       Graph with nodes + adjacency
 * @param seedNodeIds Nodes to seed the personalization vector (query entities)
 * @param alpha       Damping factor — probability of following an edge (default 0.85)
 * @param maxIter     Maximum power iterations (default 50)
 * @param tolerance   Convergence threshold on L1 norm (default 1e-6)
 */
export function computePPR(
  graph: PPRGraph,
  seedNodeIds: string[],
  alpha: number = 0.85,
  maxIter: number = 50,
  tolerance: number = 1e-6,
): PPRResult {
  const { nodes, edges, weights } = graph;
  const N = nodes.length;

  if (N === 0) return { scores: new Map(), ranked: [], iterations: 0, converged: true };

  // Filter seeds to nodes actually in the graph
  const seedSet = new Set(seedNodeIds.filter(id => edges.has(id)));
  const effectiveSeeds = seedSet.size > 0 ? seedSet : new Set(nodes.slice(0, 1)); // fallback: first node

  // Personalization vector p[v] = 1/|seeds| if seed, else 0
  const seedWeight = 1.0 / effectiveSeeds.size;
  const p = new Map<string, number>();
  for (const id of nodes) p.set(id, effectiveSeeds.has(id) ? seedWeight : 0);

  // Initialize rank vector uniformly
  let r = new Map<string, number>();
  for (const id of nodes) r.set(id, 1.0 / N);

  // Precompute out-degree (weighted) for each node
  const outDegree = new Map<string, number>();
  for (const [from, neighbors] of edges) {
    if (weights) {
      const wmap = weights.get(from) ?? new Map<string, number>();
      const totalW = neighbors.reduce((sum, to) => sum + (wmap.get(to) ?? 1.0), 0);
      outDegree.set(from, totalW || 1);
    } else {
      outDegree.set(from, neighbors.length || 1);
    }
  }
  // Dangling nodes (no outbound edges): treat as teleportation
  for (const id of nodes) {
    if (!edges.has(id) || (edges.get(id)?.length ?? 0) === 0) {
      outDegree.set(id, 1);
    }
  }

  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    const rNew = new Map<string, number>();
    for (const id of nodes) rNew.set(id, 0);

    // Distribute rank from each node to its neighbors
    for (const [from, neighbors] of edges) {
      const fromRank = r.get(from) ?? 0;
      if (fromRank === 0) continue;
      const deg = outDegree.get(from) ?? 1;
      for (const to of neighbors) {
        const w = weights ? (weights.get(from)?.get(to) ?? 1.0) : 1.0;
        const contribution = alpha * fromRank * (w / deg);
        rNew.set(to, (rNew.get(to) ?? 0) + contribution);
      }
    }

    // Handle dangling nodes — redistribute uniformly
    let danglingSum = 0;
    for (const id of nodes) {
      if (!edges.has(id) || (edges.get(id)?.length ?? 0) === 0) {
        danglingSum += alpha * (r.get(id) ?? 0);
      }
    }
    const danglingContrib = danglingSum / N;

    // Add teleportation (personalization) + dangling redistribution
    let l1 = 0;
    for (const id of nodes) {
      const val = (rNew.get(id) ?? 0) + (1 - alpha) * (p.get(id) ?? 0) + danglingContrib;
      rNew.set(id, val);
      l1 += Math.abs(val - (r.get(id) ?? 0));
    }

    r = rNew;

    if (l1 < tolerance) {
      converged = true;
      break;
    }
  }

  // Build ranked output sorted descending by score
  const ranked = [...r.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  return { scores: r, ranked, iterations, converged };
}

/**
 * Build a PPR-ready graph from entity_mentions adjacency data.
 *
 * nodes = entry IDs + entity IDs
 * edges = entry → entity (via entity_mentions) + entity → entry (reverse)
 *
 * @param mentions   Array of {memory_id, entity_id, canonical_entity_id?} rows
 * @param edgeWeight Base weight per mention (default 1.0)
 */
export function buildMentionGraph(
  mentions: Array<{ memory_id: string; entity_id: string; canonical_entity_id?: string | null }>,
  edgeWeight: number = 1.0,
): PPRGraph {
  const nodeSet = new Set<string>();
  const fwdEdges = new Map<string, string[]>(); // entry → entities
  const revEdges = new Map<string, string[]>(); // entity → entries
  const weights  = new Map<string, Map<string, number>>();

  for (const m of mentions) {
    const entryId  = m.memory_id;
    const entityId = m.canonical_entity_id ?? m.entity_id;
    if (!entryId || !entityId) continue;

    nodeSet.add(entryId);
    nodeSet.add(entityId);

    // entry → entity
    if (!fwdEdges.has(entryId)) fwdEdges.set(entryId, []);
    fwdEdges.get(entryId)!.push(entityId);

    // entity → entry (reverse edge for bidirectional walk)
    if (!revEdges.has(entityId)) revEdges.set(entityId, []);
    revEdges.get(entityId)!.push(entryId);

    // Weights
    for (const [from, to] of [[entryId, entityId], [entityId, entryId]]) {
      if (!weights.has(from)) weights.set(from, new Map());
      weights.get(from)!.set(to, (weights.get(from)!.get(to) ?? 0) + edgeWeight);
    }
  }

  // Merge forward and reverse edge maps
  const edges = new Map<string, string[]>();
  for (const [from, tos] of fwdEdges) {
    edges.set(from, [...(edges.get(from) ?? []), ...tos]);
  }
  for (const [from, tos] of revEdges) {
    edges.set(from, [...(edges.get(from) ?? []), ...tos]);
  }

  return { nodes: [...nodeSet], edges, weights };
}

/**
 * Extract the top-k memory entry IDs from PPR results.
 * Filters out entity nodes (which are UUIDs that appear in the entity set).
 *
 * @param result       PPR result
 * @param entityIds    Set of entity node IDs (to exclude from entry results)
 * @param topK         How many entry IDs to return
 */
export function topEntryIds(
  result: PPRResult,
  entityIds: Set<string>,
  topK: number = 20,
): string[] {
  return result.ranked
    .filter(({ id }) => !entityIds.has(id))
    .slice(0, topK)
    .map(({ id }) => id);
}
