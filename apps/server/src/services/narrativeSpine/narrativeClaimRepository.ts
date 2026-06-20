import { logger } from '../../logger';
import { epistemicStateFromConfidence } from '../cognition/epistemicState';
import { supabaseAdmin } from '../supabaseClient';
import type {
  NarrativeClaimEdgeRow,
  NarrativeClaimRow,
  NarrativeClaimRelation,
  UpsertNarrativeClaimInput,
} from './types';

export function toClaimRow(
  userId: string,
  input: UpsertNarrativeClaimInput,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const confidence = input.confidence ?? 0.5;
  return {
    user_id: userId,
    claim_kind: input.claimKind,
    statement: input.statement,
    summary: input.summary ?? null,
    machine_key: input.machineKey ?? null,
    confidence,
    status: input.status ?? 'active',
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    occurred_at: input.occurredAt ?? null,
    occurred_end: input.occurredEnd ?? null,
    significance: input.significance ?? null,
    epistemic_state: input.epistemicState ?? epistemicStateFromConfidence(confidence),
    valid_from: input.validFrom ?? input.occurredAt ?? null,
    valid_to: input.validTo ?? null,
    observed_at: now,
    asserted_at: now,
    extraction_method: input.extractionMethod ?? null,
    meta: input.meta ?? {},
    updated_at: now,
  };
}

export async function findClaimBySource(
  userId: string,
  sourceTable: string,
  sourceId: string,
): Promise<NarrativeClaimRow | null> {
  const { data, error } = await supabaseAdmin
    .from('narrative_claims')
    .select('*')
    .eq('user_id', userId)
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId, sourceTable, sourceId }, 'narrativeClaimRepository: findClaimBySource failed');
    return null;
  }

  return (data as NarrativeClaimRow | null) ?? null;
}

export async function upsertClaimBySource(
  userId: string,
  input: UpsertNarrativeClaimInput,
): Promise<NarrativeClaimRow | null> {
  if (!input.sourceTable || !input.sourceId) {
    const { data, error } = await supabaseAdmin
      .from('narrative_claims')
      .insert(toClaimRow(userId, input))
      .select('*')
      .single();

    if (error) {
      logger.warn({ error, userId }, 'narrativeClaimRepository: insert claim failed');
      return null;
    }
    return data as NarrativeClaimRow;
  }

  const existing = await findClaimBySource(userId, input.sourceTable, input.sourceId);
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('narrative_claims')
      .update(toClaimRow(userId, input))
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      logger.warn({ error, claimId: existing.id }, 'narrativeClaimRepository: update claim failed');
      return existing;
    }
    return data as NarrativeClaimRow;
  }

  const { data, error } = await supabaseAdmin
    .from('narrative_claims')
    .insert(toClaimRow(userId, input))
    .select('*')
    .single();

  if (error) {
    logger.warn({ error, userId, sourceTable: input.sourceTable }, 'narrativeClaimRepository: upsert insert failed');
    return null;
  }

  return data as NarrativeClaimRow;
}

export async function getClaimById(
  userId: string,
  claimId: string,
): Promise<NarrativeClaimRow | null> {
  const { data, error } = await supabaseAdmin
    .from('narrative_claims')
    .select('*')
    .eq('user_id', userId)
    .eq('id', claimId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId, claimId }, 'narrativeClaimRepository: getClaimById failed');
    return null;
  }

  return (data as NarrativeClaimRow | null) ?? null;
}

export async function upsertEdge(
  userId: string,
  fromClaimId: string,
  toClaimId: string,
  relation: NarrativeClaimRelation,
  confidence = 1,
  meta: Record<string, unknown> = {},
): Promise<NarrativeClaimEdgeRow | null> {
  const { data, error } = await supabaseAdmin
    .from('narrative_claim_edges')
    .upsert(
      {
        user_id: userId,
        from_claim_id: fromClaimId,
        to_claim_id: toClaimId,
        relation,
        confidence,
        meta,
      },
      { onConflict: 'user_id,from_claim_id,to_claim_id,relation', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error) {
    logger.warn(
      { error, fromClaimId, toClaimId, relation },
      'narrativeClaimRepository: upsertEdge failed',
    );
    return null;
  }

  return data as NarrativeClaimEdgeRow;
}

export async function getEdgesToClaim(
  userId: string,
  claimId: string,
): Promise<NarrativeClaimEdgeRow[]> {
  const { data, error } = await supabaseAdmin
    .from('narrative_claim_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('to_claim_id', claimId);

  if (error) {
    logger.warn({ error, claimId }, 'narrativeClaimRepository: getEdgesToClaim failed');
    return [];
  }

  return (data as NarrativeClaimEdgeRow[]) ?? [];
}

export async function getEdgesFromClaim(
  userId: string,
  claimId: string,
): Promise<NarrativeClaimEdgeRow[]> {
  const { data, error } = await supabaseAdmin
    .from('narrative_claim_edges')
    .select('*')
    .eq('user_id', userId)
    .eq('from_claim_id', claimId);

  if (error) {
    logger.warn({ error, claimId }, 'narrativeClaimRepository: getEdgesFromClaim failed');
    return [];
  }

  return (data as NarrativeClaimEdgeRow[]) ?? [];
}

export async function getClaimsByIds(
  userId: string,
  claimIds: string[],
): Promise<NarrativeClaimRow[]> {
  if (claimIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('narrative_claims')
    .select('*')
    .eq('user_id', userId)
    .in('id', claimIds);

  if (error) {
    logger.warn({ error, claimIds }, 'narrativeClaimRepository: getClaimsByIds failed');
    return [];
  }

  return (data as NarrativeClaimRow[]) ?? [];
}
