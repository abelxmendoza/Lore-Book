/**
 * Temporal Edge Service — Phase 2 Relationship Intelligence
 *
 * inferStartTime, findActiveEdge, upsertTemporalRelationship, computeRelationshipStrength,
 * detectRelationshipPhase, writeRelationshipSnapshot. Used by writeRelationship for
 * character_relationships and entity_relationships.
 */

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

/** Minimal context for inferStartTime/upsertTemporalRelationship; matches WriteContext.memoryId. */
export type TemporalEdgeContext = { memoryId?: string };

export type TemporalEdgeRow = {
  id: string;
  kind: 'ASSERTED' | 'EPISODIC';
  confidence: number;
  last_evidence_at: string;
  evidence_source_ids: string[] | null;
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
 * Find an active temporal edge for (userId, fromId, toId, relationshipType).
 */
export async function findActiveEdge(
  userId: string,
  fromId: string,
  toId: string,
  relationshipType: string
): Promise<TemporalEdgeRow | null> {
  const { data, error } = await supabaseAdmin
    .from('temporal_edges')
    .select('id, kind, confidence, last_evidence_at, evidence_source_ids')
    .eq('user_id', userId)
    .eq('from_entity_id', fromId)
    .eq('to_entity_id', toId)
    .eq('relationship_type', relationshipType)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error, userId, fromId, toId, relationshipType }, 'findActiveEdge failed');
    return null;
  }
  return data as TemporalEdgeRow | null;
}

/**
 * Upsert a temporal relationship: update existing active edge or insert. Returns the row (with id, kind, confidence, last_evidence_at, evidence_source_ids).
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
  ctx: TemporalEdgeContext,
  evidenceSourceIds?: string[]
): Promise<TemporalEdgeRow | null> {
  const evidenceIds = evidenceSourceIds ?? (ctx.memoryId ? [ctx.memoryId] : []);
  const now = new Date().toISOString();

  const existing = await findActiveEdge(userId, fromId, toId, relationshipType);
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
      .select('id, kind, confidence, last_evidence_at, evidence_source_ids')
      .single();
    if (error) {
      logger.warn({ err: error, existingId: existing.id }, 'upsertTemporalRelationship update failed');
      return null;
    }
    return data as TemporalEdgeRow;
  }

  const startTime = await inferStartTime(ctx);
  const { data, error } = await supabaseAdmin.from('temporal_edges').insert({
    user_id: userId,
    from_entity_id: fromId,
    to_entity_id: toId,
    from_entity_type: fromType,
    to_entity_type: toType,
    relationship_type: relationshipType,
    kind,
    confidence,
    start_time: startTime,
    end_time: null,
    last_evidence_at: now,
    evidence_source_ids: evidenceIds,
    active: true,
    created_at: now,
    updated_at: now,
  }).select('id, kind, confidence, last_evidence_at, evidence_source_ids').single();
  if (error) {
    logger.warn({ err: error, userId, fromId, toId, relationshipType }, 'upsertTemporalRelationship insert failed');
    return null;
  }
  return data as TemporalEdgeRow;
}

/**
 * Compute relationship strength from frequency, recency, and confidence. Clamped to [0, 1].
 * Formula: frequency (evidence count capped) + recency (exp decay) + confidence; averaged and clamped.
 */
export function computeRelationshipStrength(edge: {
  evidence_source_ids?: string[] | null;
  last_evidence_at: string;
  confidence: number;
}): number {
  const count = edge.evidence_source_ids?.length ?? 0;
  const frequency = Math.min(1, count / 10);
  const last = new Date(edge.last_evidence_at).getTime();
  const daysSince = (Date.now() - last) / (24 * 60 * 60 * 1000);
  const recency = Math.exp(-daysSince / 365);
  const confidence = Math.max(0, Math.min(1, edge.confidence));
  const score = (frequency + recency + confidence) / 3;
  return Math.max(0, Math.min(1, score));
}

export type RelationshipPhase = 'EVENT' | 'CORE' | 'ACTIVE' | 'WEAK' | 'DORMANT';

/**
 * Detect phase: EPISODIC -> EVENT; else from computeRelationshipStrength thresholds.
 */
export function detectRelationshipPhase(edge: TemporalEdgeRow): RelationshipPhase {
  if (edge.kind === 'EPISODIC') return 'EVENT';
  const strength = computeRelationshipStrength(edge);
  if (strength > 0.8) return 'CORE';
  if (strength > 0.4) return 'ACTIVE';
  if (strength > 0.2) return 'WEAK';
  return 'DORMANT';
}

/**
 * Upsert relationship_snapshots for the given temporal edge (phase, confidence, updated_at).
 */
export async function writeRelationshipSnapshot(edge: TemporalEdgeRow): Promise<void> {
  const phase = detectRelationshipPhase(edge);
  const { error } = await supabaseAdmin.from('relationship_snapshots').upsert(
    {
      relationship_id: edge.id,
      phase,
      confidence: edge.confidence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'relationship_id' }
  );
  if (error) logger.warn({ err: error, relationshipId: edge.id, phase }, 'writeRelationshipSnapshot failed');
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
  for (const e of edges) {
    const { error: up } = await supabaseAdmin
      .from('temporal_edges')
      .update({
        end_time: e.last_evidence_at,
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', e.id);
    if (!up) closed++;
    else logger.warn({ err: up, id: e.id }, 'closeEpisodicEdges update failed');
  }
  return closed;
}
