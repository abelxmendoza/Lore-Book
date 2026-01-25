/**
 * Scoped temporal relationship queries — Phase 2.1 + 3.1
 * Phase-first: filter by temporal_edges.phase; no snapshot join required for filtering.
 */

import { supabaseAdmin } from './supabaseClient';
import { RELATIONSHIP_SCOPE_SET } from '../er/scopeInference';

export type TimeRange = { start: string; end: string };

/**
 * Relationships in a scope overlapping the time range. Phase-first: phase IN (CORE, ACTIVE, WEAK).
 * (start_time IS NULL OR start_time <= end) AND (end_time IS NULL OR end_time >= start)
 */
export async function getRelationshipsByScope(
  userId: string,
  scope: string,
  timeRange: TimeRange
): Promise<{ edges: unknown[]; snapshots: unknown[] }> {
  if (!RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    return { edges: [], snapshots: [] };
  }

  const { data: edges, error: eErr } = await supabaseAdmin
    .from('temporal_edges')
    .select(`
      id, from_entity_id, to_entity_id, from_entity_type, to_entity_type,
      relationship_type, kind, scope, confidence, phase, start_time, end_time,
      last_evidence_at, active, created_at, updated_at
    `)
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('active', true)
    .in('phase', ['CORE', 'ACTIVE', 'WEAK'])
    .or(`start_time.is.null,start_time.lte.${timeRange.end}`)
    .or(`end_time.is.null,end_time.gte.${timeRange.start}`);

  if (eErr) return { edges: [], snapshots: [] };

  const edgeIds = (edges || []).map((r: { id: string }) => r.id);
  if (edgeIds.length === 0) return { edges: edges || [], snapshots: [] };

  const { data: snapshots } = await supabaseAdmin
    .from('relationship_snapshots')
    .select('relationship_id, phase, confidence, scope, updated_at')
    .in('relationship_id', edgeIds);

  return { edges: edges || [], snapshots: snapshots || [] };
}

/**
 * Pure function: for a window [start, end], return the previous window of the same
 * duration immediately before it. Used by generateLifeSummary for the "before" window.
 */
export function getPreviousWindow(timeRange: TimeRange): TimeRange {
  const start = new Date(timeRange.start).getTime();
  const end = new Date(timeRange.end).getTime();
  const duration = end - start;
  return {
    start: new Date(start - duration).toISOString(),
    end: timeRange.start,
  };
}

/**
 * Relationships across all scopes overlapping the time range (or all active when timeRange omitted).
 * No scope or phase filter. active = true.
 * When timeRange is provided: (start_time IS NULL OR start_time <= end) AND (end_time IS NULL OR end_time >= start).
 * When timeRange is omitted: no time filters (all active edges).
 */
export async function getRelationshipsInRange(
  userId: string,
  timeRange?: TimeRange
): Promise<{ edges: unknown[]; snapshots: unknown[] }> {
  let q = supabaseAdmin
    .from('temporal_edges')
    .select(`
      id, from_entity_id, to_entity_id, from_entity_type, to_entity_type,
      relationship_type, kind, scope, confidence, phase, start_time, end_time,
      last_evidence_at, active, created_at, updated_at
    `)
    .eq('user_id', userId)
    .eq('active', true);

  if (timeRange != null) {
    q = q
      .or(`start_time.is.null,start_time.lte.${timeRange.end}`)
      .or(`end_time.is.null,end_time.gte.${timeRange.start}`);
  }

  const { data: edges, error: eErr } = await q;

  if (eErr) return { edges: [], snapshots: [] };

  const edgeIds = (edges || []).map((r: { id: string }) => r.id);
  if (edgeIds.length === 0) return { edges: edges || [], snapshots: [] };

  const { data: snapshots } = await supabaseAdmin
    .from('relationship_snapshots')
    .select('relationship_id, phase, confidence, scope, updated_at')
    .in('relationship_id', edgeIds);

  return { edges: edges || [], snapshots: snapshots || [] };
}

/**
 * Fading connections: phase WEAK or DORMANT on temporal_edges. No last_evidence_at cutoff.
 * Optionally filter by scope. Order by last_evidence_at ASC.
 */
export async function getFadingConnections(
  userId: string,
  scope?: string
): Promise<{ edges: unknown[]; snapshots: unknown[] }> {
  let q = supabaseAdmin
    .from('temporal_edges')
    .select('id, from_entity_id, to_entity_id, relationship_type, kind, scope, phase, last_evidence_at')
    .eq('user_id', userId)
    .eq('active', true)
    .in('phase', ['WEAK', 'DORMANT'])
    .order('last_evidence_at', { ascending: true });

  if (scope != null && scope !== '' && RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    q = q.eq('scope', scope);
  }

  const { data: edges, error: eErr } = await q;

  if (eErr) return { edges: [], snapshots: [] };
  if (!edges?.length) return { edges: [], snapshots: [] };

  const { data: snapshots } = await supabaseAdmin
    .from('relationship_snapshots')
    .select('relationship_id, phase, confidence, scope, updated_at')
    .in('relationship_id', edges.map((r: { id: string }) => r.id));

  return { edges, snapshots: snapshots || [] };
}

/**
 * Core people for an era: phase CORE or ACTIVE on temporal_edges, time overlap with era.
 * (start_time IS NULL OR start_time <= end) AND (end_time IS NULL OR end_time >= start)
 */
export async function getCorePeopleForEra(
  userId: string,
  scope: string,
  eraRange: TimeRange
): Promise<{ edges: unknown[]; snapshots: unknown[] }> {
  if (!RELATIONSHIP_SCOPE_SET.has(scope as any)) {
    return { edges: [], snapshots: [] };
  }

  const { data: edges, error: eErr } = await supabaseAdmin
    .from('temporal_edges')
    .select(`
      id, from_entity_id, to_entity_id, from_entity_type, to_entity_type,
      relationship_type, kind, scope, confidence, phase, start_time, end_time, last_evidence_at
    `)
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('active', true)
    .in('phase', ['CORE', 'ACTIVE'])
    .or(`start_time.is.null,start_time.lte.${eraRange.end}`)
    .or(`end_time.is.null,end_time.gte.${eraRange.start}`);

  if (eErr) return { edges: [], snapshots: [] };

  const edgeIds = (edges || []).map((r: { id: string }) => r.id);
  if (edgeIds.length === 0) return { edges: edges || [], snapshots: [] };

  const { data: snapshots } = await supabaseAdmin
    .from('relationship_snapshots')
    .select('relationship_id, phase, confidence, scope, updated_at')
    .in('relationship_id', edgeIds);

  return { edges: edges || [], snapshots: snapshots || [] };
}
