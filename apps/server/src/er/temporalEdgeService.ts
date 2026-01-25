/**
 * Temporal Edge Service — Phase 2 + 3.1 Relationship Intelligence
 *
 * inferStartTime, findActiveEdge, upsertTemporalRelationship, computeRelationshipStrength,
 * determinePhase, writeRelationshipSnapshot, updateTemporalEdge, fetchActiveTemporalEdges.
 * Phase 3.1: phase-on-edge, new strength formula (recency 0.6 + confidence 0.4, expDecay 60).
 */

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { expDecay, daysBetween } from './timeUtils';

/** Minimal context for inferStartTime/upsertTemporalRelationship; matches WriteContext. */
export type TemporalEdgeContext = { memoryId?: string; scope?: string };

/** Phase on the edge (source of truth). EVENT only in relationship_snapshots (legacy). */
export type RelationshipPhase = 'CORE' | 'ACTIVE' | 'WEAK' | 'DORMANT' | 'ENDED';

export type TemporalEdgeRow = {
  id: string;
  kind: 'ASSERTED' | 'EPISODIC';
  confidence: number;
  last_evidence_at: string;
  evidence_source_ids: string[] | null;
  scope?: string;
  phase: string;
  /** Present when selected; required for relationship insights (Phase 3.2) and name resolution (Phase 4). */
  to_entity_id?: string;
  to_entity_type?: 'character' | 'omega_entity';
  from_entity_id?: string;
  start_time?: string | null;
};

const EPISODIC_CLOSURE_DAYS = parseInt(process.env.EPISODIC_CLOSURE_DAYS || '90', 10);

/**
 * Infer start_time from ctx.memoryId: journal_entries.date or chat_messages.created_at.
 * If !ctx.memoryId or not found, return null.
 */
export async function inferStartTime(ctx: TemporalEdgeContext): Promise<string | null> {
  if (!ctx.memoryId) return null;
  const id = ctx.memoryId;
  const { data: je } = await supabaseAdmin.from('journal_entries').select('date').eq('id', id).single();
  if (je?.date) return typeof je.date === 'string' ? je.date : new Date(je.date).toISOString();
  const { data: cm } = await supabaseAdmin.from('chat_messages').select('created_at').eq('id', id).single();
  if (cm?.created_at) return typeof cm.created_at === 'string' ? cm.created_at : new Date(cm.created_at).toISOString();
  return null;
}

/**
 * Find an active temporal edge for (userId, fromId, toId, relationshipType, scope). Scope is part of identity.
 */
export async function findActiveEdge(
  userId: string,
  fromId: string,
  toId: string,
  relationshipType: string,
  scope: string
): Promise<TemporalEdgeRow | null> {
  const { data, error } = await supabaseAdmin
    .from('temporal_edges')
    .select('id, kind, confidence, last_evidence_at, evidence_source_ids, scope, phase')
    .eq('user_id', userId)
    .eq('from_entity_id', fromId)
    .eq('to_entity_id', toId)
    .eq('relationship_type', relationshipType)
    .eq('scope', scope)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error, userId, fromId, toId, relationshipType, scope }, 'findActiveEdge failed');
    return null;
  }
  return data as TemporalEdgeRow | null;
}

/**
 * Upsert a temporal relationship: update existing active edge or insert. Scope is part of identity. Returns the row.
 */
export async function upsertTemporalRelationship(
  userId: string,
  fromId: string,
  toId: string,
  fromType: 'character' | 'omega_entity',
  toType: 'character' | 'omega_entity',
  relationshipType: string,
  kind: 'ASSERTED' | 'EPISODIC',
  confidence: number,
  scope: string,
  ctx: TemporalEdgeContext,
  evidenceSourceIds?: string[]
): Promise<TemporalEdgeRow | null> {
  const evidenceIds = evidenceSourceIds ?? (ctx.memoryId ? [ctx.memoryId] : []);
  const now = new Date().toISOString();
  const scopeVal = scope || 'global';

  const existing = await findActiveEdge(userId, fromId, toId, relationshipType, scopeVal);
  if (existing) {
    const existingIds = (existing.evidence_source_ids || []) as string[];
    const merged = [...existingIds, ...evidenceIds.filter((id) => !existingIds.includes(id))];
    const newConfidence = Math.max(existing.confidence, confidence);
    const { data, error } = await supabaseAdmin
      .from('temporal_edges')
      .update({
        confidence: newConfidence,
        last_evidence_at: now,
        evidence_source_ids: merged,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('id, kind, confidence, last_evidence_at, evidence_source_ids, scope, phase')
      .single();
    if (error) {
      logger.warn({ err: error, existingId: existing.id }, 'upsertTemporalRelationship update failed');
      return null;
    }
    return data as TemporalEdgeRow;
  }

  const startTime = await inferStartTime(ctx);
  const initialStrength = computeRelationshipStrength({ confidence, last_evidence_at: now });
  const initialPhase = determinePhase(initialStrength);
  const { data, error } = await supabaseAdmin.from('temporal_edges').insert({
    user_id: userId,
    from_entity_id: fromId,
    to_entity_id: toId,
    from_entity_type: fromType,
    to_entity_type: toType,
    relationship_type: relationshipType,
    kind,
    confidence,
    scope: scopeVal,
    phase: initialPhase,
    start_time: startTime,
    end_time: null,
    last_evidence_at: now,
    evidence_source_ids: evidenceIds,
    active: true,
    created_at: now,
    updated_at: now,
  }).select('id, kind, confidence, last_evidence_at, evidence_source_ids, scope, phase').single();
  if (error) {
    logger.warn({ err: error, userId, fromId, toId, relationshipType, scope: scopeVal }, 'upsertTemporalRelationship insert failed');
    return null;
  }
  return data as TemporalEdgeRow;
}

const RECENCY_WEIGHT = 0.6;
const CONFIDENCE_WEIGHT = 0.4;
const STRENGTH_HALFLIFE_DAYS = 60;

/**
 * Compute relationship strength. Phase 3.1 formula: 0.4*confidence + 0.6*recency (expDecay 60d).
 * Clamped to [0, 1].
 */
export function computeRelationshipStrength(edge: {
  last_evidence_at: string;
  confidence: number;
}): number {
  const daysSinceLastSeen = edge.last_evidence_at
    ? daysBetween(edge.last_evidence_at, new Date())
    : Infinity;
  const recencyScore = expDecay(daysSinceLastSeen, STRENGTH_HALFLIFE_DAYS);
  const confidence = Math.max(0, Math.min(1, edge.confidence));
  const strength = confidence * CONFIDENCE_WEIGHT + recencyScore * RECENCY_WEIGHT;
  return Math.max(0, Math.min(1, strength));
}

/**
 * Determine phase from strength. Phase 3.1 thresholds: CORE≥0.8, ACTIVE≥0.55, WEAK≥0.3, else DORMANT.
 */
export function determinePhase(strength: number): RelationshipPhase {
  if (strength >= 0.8) return 'CORE';
  if (strength >= 0.55) return 'ACTIVE';
  if (strength >= 0.3) return 'WEAK';
  return 'DORMANT';
}

/**
 * Upsert relationship_snapshots for the given temporal edge (phase, confidence, scope, updated_at).
 * Uses edge.phase when present; otherwise derives from computeRelationshipStrength + determinePhase.
 */
export async function writeRelationshipSnapshot(edge: TemporalEdgeRow, scopeOverride?: string): Promise<void> {
  const phase = edge.phase ?? determinePhase(computeRelationshipStrength(edge)) ?? 'ACTIVE';
  const scope = scopeOverride ?? edge.scope ?? 'global';
  const { error } = await supabaseAdmin.from('relationship_snapshots').upsert(
    {
      relationship_id: edge.id,
      phase,
      confidence: edge.confidence,
      scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'relationship_id' }
  );
  if (error) logger.warn({ err: error, relationshipId: edge.id, phase }, 'writeRelationshipSnapshot failed');
}

/**
 * Update a temporal edge's phase, active, and optionally end_time. Used by the evolve job.
 */
export async function updateTemporalEdge(
  id: string,
  payload: { phase: RelationshipPhase; active: boolean; end_time?: string | null }
): Promise<void> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = {
    phase: payload.phase,
    active: payload.active,
    updated_at: now,
  };
  if (payload.end_time !== undefined) body.end_time = payload.end_time;
  const { error } = await supabaseAdmin.from('temporal_edges').update(body).eq('id', id);
  if (error) logger.warn({ err: error, id, phase: payload.phase }, 'updateTemporalEdge failed');
}

/**
 * Fetch all active temporal edges, optionally for one user. Used by the evolve job.
 */
export async function fetchActiveTemporalEdges(userId?: string): Promise<TemporalEdgeRow[]> {
  let q = supabaseAdmin
    .from('temporal_edges')
    .select('id, kind, confidence, last_evidence_at, evidence_source_ids, scope, phase, to_entity_id, to_entity_type, from_entity_id, start_time')
    .eq('active', true);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) {
    logger.warn({ err: error, userId }, 'fetchActiveTemporalEdges failed');
    return [];
  }
  return (data || []) as TemporalEdgeRow[];
}

/** Days after which episodic edges with no new evidence are closed. */
export function getEpisodicClosureDays(): number {
  return EPISODIC_CLOSURE_DAYS;
}

/**
 * Close episodic edges that have had no evidence in the last EPISODIC_CLOSURE_DAYS.
 * Sets end_time = last_evidence_at, active = false.
 */
export async function closeEpisodicEdges(userId: string): Promise<number> {
  const days = getEpisodicClosureDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const { data: edges, error } = await supabaseAdmin
    .from('temporal_edges')
    .select('id, last_evidence_at')
    .eq('user_id', userId)
    .eq('kind', 'EPISODIC')
    .eq('active', true)
    .lt('last_evidence_at', cutoffIso);

  if (error) {
    logger.warn({ err: error, userId }, 'closeEpisodicEdges query failed');
    return 0;
  }
  if (!edges?.length) return 0;

  let closed = 0;
  const now = new Date().toISOString();
  for (const e of edges) {
    const { error: up } = await supabaseAdmin
      .from('temporal_edges')
      .update({
        phase: 'ENDED',
        end_time: e.last_evidence_at,
        active: false,
        updated_at: now,
      })
      .eq('id', e.id);
    if (!up) closed++;
    else logger.warn({ err: up, id: e.id }, 'closeEpisodicEdges update failed');
  }
  return closed;
}
