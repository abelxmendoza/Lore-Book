import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EpistemicState } from './epistemicState';
import { assertValidEdge, type GraphNodeKind, type RelationKind } from './relationshipRegistry';

export type GraphEdgeRow = {
  id: string;
  user_id: string;
  from_node_id: string;
  to_node_id: string;
  relation_kind: RelationKind;
  confidence: number;
  epistemic_state: EpistemicState;
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string;
  asserted_at: string;
  extraction_method: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UpsertGraphEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  relationKind: RelationKind;
  fromNodeKind: GraphNodeKind;
  toNodeKind: GraphNodeKind;
  confidence?: number;
  epistemicState?: EpistemicState;
  validFrom?: string | null;
  validTo?: string | null;
  extractionMethod?: string | null;
  meta?: Record<string, unknown>;
};

export async function upsertGraphEdge(
  userId: string,
  input: UpsertGraphEdgeInput,
): Promise<GraphEdgeRow | null> {
  const validation = assertValidEdge(input.relationKind, input.fromNodeKind, input.toNodeKind);
  if (!validation.valid) {
    logger.warn({ validation, input }, 'graphEdgeRepository: invalid edge rejected');
    return null;
  }

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    from_node_id: input.fromNodeId,
    to_node_id: input.toNodeId,
    relation_kind: input.relationKind,
    confidence: input.confidence ?? 0.7,
    epistemic_state: input.epistemicState ?? 'POSSIBLE',
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
    observed_at: now,
    asserted_at: now,
    extraction_method: input.extractionMethod ?? null,
    meta: input.meta ?? {},
    updated_at: now,
  };

  const { data: existing } = await supabaseAdmin
    .from('graph_edges')
    .select('id')
    .eq('user_id', userId)
    .eq('from_node_id', input.fromNodeId)
    .eq('to_node_id', input.toNodeId)
    .eq('relation_kind', input.relationKind)
    .is('valid_to', null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('graph_edges')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return null;
    return data as GraphEdgeRow;
  }

  const { data, error } = await supabaseAdmin
    .from('graph_edges')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    logger.warn({ error, input }, 'graphEdgeRepository: insert failed');
    return null;
  }
  return data as GraphEdgeRow;
}

export async function listEdgesFromNode(
  userId: string,
  nodeId: string,
): Promise<GraphEdgeRow[]> {
  const { data, error } = await supabaseAdmin
    .from('graph_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('from_node_id', nodeId)
    .is('valid_to', null);

  if (error) return [];
  return (data as GraphEdgeRow[]) ?? [];
}
