import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EpistemicState } from './epistemicState';
import type { GraphNodeKind } from './relationshipRegistry';

export type GraphNodeRow = {
  id: string;
  user_id: string;
  node_kind: GraphNodeKind;
  root_type: string;
  classification_id: string | null;
  machine_key: string | null;
  display_name: string;
  epistemic_state: EpistemicState;
  confidence: number;
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string;
  asserted_at: string;
  extraction_method: string | null;
  source_table: string | null;
  source_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UpsertGraphNodeInput = {
  nodeKind: GraphNodeKind;
  rootType: string;
  displayName: string;
  machineKey?: string | null;
  confidence?: number;
  epistemicState?: EpistemicState;
  validFrom?: string | null;
  validTo?: string | null;
  observedAt?: string;
  assertedAt?: string;
  extractionMethod?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  meta?: Record<string, unknown>;
};

function toRow(userId: string, input: UpsertGraphNodeInput): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    node_kind: input.nodeKind,
    root_type: input.rootType,
    display_name: input.displayName,
    machine_key: input.machineKey ?? null,
    confidence: input.confidence ?? 0.5,
    epistemic_state: input.epistemicState ?? 'UNKNOWN',
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
    observed_at: input.observedAt ?? now,
    asserted_at: input.assertedAt ?? now,
    extraction_method: input.extractionMethod ?? null,
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    meta: input.meta ?? {},
    updated_at: now,
  };
}

export async function findGraphNodeBySource(
  userId: string,
  sourceTable: string,
  sourceId: string,
): Promise<GraphNodeRow | null> {
  const { data, error } = await supabaseAdmin
    .from('graph_nodes')
    .select('*')
    .eq('user_id', userId)
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId, sourceTable, sourceId }, 'graphNodeRepository: findBySource failed');
    return null;
  }
  return (data as GraphNodeRow | null) ?? null;
}

export async function upsertGraphNodeBySource(
  userId: string,
  input: UpsertGraphNodeInput,
): Promise<GraphNodeRow | null> {
  if (!input.sourceTable || !input.sourceId) {
    const { data, error } = await supabaseAdmin
      .from('graph_nodes')
      .insert(toRow(userId, input))
      .select('*')
      .single();
    if (error) {
      logger.warn({ error, userId }, 'graphNodeRepository: insert failed');
      return null;
    }
    return data as GraphNodeRow;
  }

  const existing = await findGraphNodeBySource(userId, input.sourceTable, input.sourceId);
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('graph_nodes')
      .update(toRow(userId, input))
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) {
      logger.warn({ error, userId }, 'graphNodeRepository: update failed');
      return null;
    }
    return data as GraphNodeRow;
  }

  const { data, error } = await supabaseAdmin
    .from('graph_nodes')
    .insert(toRow(userId, input))
    .select('*')
    .single();

  if (error) {
    logger.warn({ error, userId }, 'graphNodeRepository: upsert insert failed');
    return null;
  }
  return data as GraphNodeRow;
}

export async function listGraphNodes(
  userId: string,
  opts?: { nodeKind?: GraphNodeKind; limit?: number },
): Promise<GraphNodeRow[]> {
  let query = supabaseAdmin
    .from('graph_nodes')
    .select('*')
    .eq('user_id', userId)
    .is('valid_to', null)
    .order('updated_at', { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.nodeKind) query = query.eq('node_kind', opts.nodeKind);

  const { data, error } = await query;
  if (error) {
    logger.warn({ error, userId }, 'graphNodeRepository: list failed');
    return [];
  }
  return (data as GraphNodeRow[]) ?? [];
}
