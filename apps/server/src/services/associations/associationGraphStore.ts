/**
 * Association Graph Store — persistence adapter for the association graph.
 * Hydrates a per-user AssociationGraph from `association_edges` and flushes
 * edges back via upsert on the (user, source, type, target) key. Keeps the
 * graph data-structure pure (no DB awareness) — this is the only DB-aware file.
 */
import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { AssociationGraph } from './associationGraphService';
import type { AssociationEdge, AssociationEvidence, AssociationTargetKind, AssociationType } from './associationTypes';

interface AssociationEdgeRow {
  user_id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_name: string;
  target_name: string;
  target_kind: string;
  association_type: string;
  confidence: number;
  mention_count: number;
  first_seen: string;
  last_seen: string;
  supporting_evidence: AssociationEvidence[] | null;
  promoted_from: string | null;
  promoted_to: string | null;
}

function rowToEdge(row: AssociationEdgeRow): AssociationEdge {
  return {
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    sourceName: row.source_name,
    targetName: row.target_name,
    targetKind: (row.target_kind as AssociationTargetKind) ?? 'unknown',
    associationType: row.association_type as AssociationType,
    confidence: Number(row.confidence),
    mentionCount: row.mention_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    supportingEvidence: Array.isArray(row.supporting_evidence) ? row.supporting_evidence : [],
    promotedFrom: (row.promoted_from as AssociationType) ?? undefined,
    promotedTo: (row.promoted_to as AssociationType) ?? undefined,
  };
}

function edgeToRow(userId: string, edge: AssociationEdge): AssociationEdgeRow {
  return {
    user_id: userId,
    source_entity_id: edge.sourceEntityId,
    target_entity_id: edge.targetEntityId,
    source_name: edge.sourceName,
    target_name: edge.targetName,
    target_kind: edge.targetKind,
    association_type: edge.associationType,
    confidence: edge.confidence,
    mention_count: edge.mentionCount,
    first_seen: edge.firstSeen,
    last_seen: edge.lastSeen,
    supporting_evidence: edge.supportingEvidence,
    promoted_from: edge.promotedFrom ?? null,
    promoted_to: edge.promotedTo ?? null,
  };
}

export const associationGraphStore = {
  /** Build a graph hydrated with the user's persisted edges. */
  async loadGraph(userId: string): Promise<AssociationGraph> {
    const graph = new AssociationGraph();
    const { data, error } = await supabaseAdmin
      .from('association_edges')
      .select(
        'user_id, source_entity_id, target_entity_id, source_name, target_name, target_kind, association_type, confidence, mention_count, first_seen, last_seen, supporting_evidence, promoted_from, promoted_to',
      )
      .eq('user_id', userId);
    if (error) {
      logger.warn({ error, userId }, 'association_edges load failed; starting empty');
      return graph;
    }
    graph.hydrate((data ?? []).map((r) => rowToEdge(r as AssociationEdgeRow)));
    return graph;
  },

  /** Upsert the given edges for a user (idempotent on the edge key). */
  async persist(userId: string, edges: AssociationEdge[]): Promise<void> {
    if (edges.length === 0) return;
    const rows = edges.map((e) => ({ ...edgeToRow(userId, e), updated_at: new Date().toISOString() }));
    const { error } = await supabaseAdmin
      .from('association_edges')
      .upsert(rows, { onConflict: 'user_id,source_entity_id,association_type,target_entity_id' });
    if (error) logger.warn({ error, userId, count: rows.length }, 'association_edges upsert failed');
  },
};
