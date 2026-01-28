/**
 * Parallel-structure resolution: explicit parallel_to relations + date-based overlaps.
 * Scope: saga and arc only (matching timeline_node_relations).
 */

import { supabaseAdmin } from '../supabaseClient';
import { nodeRelationService } from '../threads/nodeRelationService';
import type { ParallelContext, ParallelNode, ParallelRelationRef } from '../../types/timelineInsight';

const ONGOING_END = '9999-12-31';

/** Node shape for resolution: id, layer (saga|arc), start_date, end_date. */
export type NodeForParallels = {
  id: string;
  layer: 'saga' | 'arc';
  user_id: string;
  start_date: string;
  end_date: string | null;
};

function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean {
  const aE = aEnd ?? ONGOING_END;
  const bE = bEnd ?? ONGOING_END;
  return aStart < bE && aE > bStart;
}

/**
 * Find saga/arc nodes whose date range overlaps this node's range, excluding self.
 */
export async function findOverlappingNodes(
  userId: string,
  node: NodeForParallels
): Promise<ParallelNode[]> {
  const results: ParallelNode[] = [];
  const nodeEnd = node.end_date ?? ONGOING_END;

  for (const table of ['timeline_sagas', 'timeline_arcs'] as const) {
    const typ: 'saga' | 'arc' = table === 'timeline_sagas' ? 'saga' : 'arc';
    const { data: rows } = await supabaseAdmin
      .from(table)
      .select('id, start_date, end_date')
      .eq('user_id', userId)
      .lt('start_date', nodeEnd)
      .or(`end_date.gte.${node.start_date},end_date.is.null`);

    const list = (rows ?? []) as Array<{ id: string; start_date: string; end_date: string | null }>;
    for (const r of list) {
      if (r.id === node.id && typ === node.layer) continue;
      if (!overlaps(node.start_date, node.end_date, r.start_date, r.end_date)) continue;
      const overlapStart =
        new Date(node.start_date) > new Date(r.start_date) ? node.start_date : r.start_date;
      const e1 = node.end_date ?? ONGOING_END;
      const e2 = r.end_date ?? ONGOING_END;
      const overlapEnd = new Date(e1) < new Date(e2) ? e1 : e2;
      results.push({
        node_id: r.id,
        node_layer: typ,
        overlap_start: overlapStart,
        overlap_end: overlapEnd,
      });
    }
  }

  return results;
}

/**
 * Resolve full parallel context: explicit parallel_to relations + implicit date overlaps.
 * For non-saga/arc layers returns empty explicit/implicit.
 */
export async function resolveParallelContext(
  userId: string,
  node: NodeForParallels
): Promise<ParallelContext> {
  const empty: ParallelContext = {
    node_id: node.id,
    node_layer: node.layer,
    explicit: [],
    implicit: [],
  };

  if (node.layer !== 'saga' && node.layer !== 'arc') {
    return empty;
  }

  const [explicitRefs, implicitNodes] = await Promise.all([
    getExplicitParallelRefs(userId, node),
    findOverlappingNodes(userId, node),
  ]);

  return {
    node_id: node.id,
    node_layer: node.layer,
    explicit: explicitRefs,
    implicit: implicitNodes,
  };
}

async function getExplicitParallelRefs(
  userId: string,
  node: NodeForParallels
): Promise<ParallelRelationRef[]> {
  const { incoming, outgoing } = await nodeRelationService.listByNode(
    userId,
    node.id,
    node.layer
  );
  const refs: ParallelRelationRef[] = [];
  for (const r of [...incoming, ...outgoing]) {
    if (r.relation_type !== 'parallel_to') continue;
    const otherId = r.from_node_id === node.id ? r.to_node_id : r.from_node_id;
    const otherLayer = r.from_node_id === node.id ? r.to_node_type : r.from_node_type;
    refs.push({
      relation_id: r.id,
      other_node_id: otherId,
      other_node_layer: otherLayer,
    });
  }
  return refs;
}
