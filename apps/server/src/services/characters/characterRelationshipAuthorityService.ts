/**
 * Relationship Authority — the canonical source of truth for "what is/was
 * the relationship between these two characters," distinct from
 * character_relationships (which stays a best-effort current-state cache
 * other, not-yet-migrated code paths still read directly).
 *
 * Core rule this exists to enforce: authority beats chronology. A later,
 * lower-authority write (e.g. a system job reprocessing old evidence) must
 * never silently resurrect a state the user has already explicitly
 * corrected, even though it was written more recently. See
 * projectCurrentRelationship() for the exact precedence.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { MutationAuthority } from '../canonicalMutation/canonicalMutationTypes';

export type RelationshipChangeKind = 'CREATED' | 'TRANSITIONED' | 'ENDED' | 'CORRECTED';

export interface RelationshipHistoryRow {
  id: string;
  fromRelationshipType: string | null;
  fromStatus: string | null;
  toRelationshipType: string | null;
  toStatus: string | null;
  changedAt: string;
  recordedAt: string;
  validUntil: string | null;
  changeKind: RelationshipChangeKind;
  authority: MutationAuthority;
  evidenceIds: string[];
  confidence: number | null;
  relationshipId: string | null;
  correctsHistoryId: string | null;
}

export interface CurrentRelationshipProjection {
  type: string | null;
  status: string | null;
  authority: MutationAuthority | 'MIGRATED';
  changedAt: string;
  confidence: number | null;
  evidenceIds: string[];
  /** True when this projection was synthesized from the legacy
   *  character_relationships cache because no history rows exist yet. */
  isMigratedBaseline: boolean;
}

export interface RelationshipProjection {
  current: CurrentRelationshipProjection | null;
  /** Real historical states, oldest first. Excludes pure-retraction
   *  CORRECTED rows — those are provenance, not user-facing history. */
  history: RelationshipHistoryRow[];
  /** Assertions that were later explicitly corrected — audit trail only,
   *  never rendered as historical truth. */
  correctedAssertions: RelationshipHistoryRow[];
  unresolvedConflicts: string[];
}

/** Same vocabulary as MutationAuthority, plus a synthetic MIGRATED floor
 *  used only for the on-read legacy baseline — never written to the DB. */
const AUTHORITY_RANK: Record<MutationAuthority | 'MIGRATED', number> = {
  USER_EXPLICIT: 5,
  USER_CONFIRMED: 4,
  MANUAL_OPERATOR: 3,
  IMPORTED_SOURCE: 2,
  SYSTEM_DERIVED: 1,
  MIGRATED: 0,
};

function toHistoryRow(row: Record<string, unknown>): RelationshipHistoryRow {
  return {
    id: row.id as string,
    fromRelationshipType: (row.from_relationship_type as string | null) ?? null,
    fromStatus: (row.from_status as string | null) ?? null,
    toRelationshipType: (row.to_relationship_type as string | null) ?? null,
    toStatus: (row.to_status as string | null) ?? null,
    changedAt: row.changed_at as string,
    recordedAt: row.recorded_at as string,
    validUntil: (row.valid_until as string | null) ?? null,
    changeKind: row.change_kind as RelationshipChangeKind,
    authority: row.authority as MutationAuthority,
    evidenceIds: (row.evidence_ids as string[] | null) ?? [],
    confidence: (row.confidence as number | null) ?? null,
    relationshipId: (row.relationship_id as string | null) ?? null,
    correctsHistoryId: (row.corrects_history_id as string | null) ?? null,
  };
}

/** A row makes a positive claim about the relationship (competes for
 *  "current" and belongs in user-facing history) unless it's a pure
 *  retraction — a CORRECTED row with no new type/status of its own. */
function isPositiveClaim(row: RelationshipHistoryRow): boolean {
  if (row.changeKind !== 'CORRECTED') return true;
  return row.toRelationshipType !== null || row.toStatus !== null;
}

/**
 * Authority-aware projection: reads the full ledger for one directed pair
 * and derives current state + history. Never infers "ended" from absence —
 * only explicit rows (or the legacy baseline) produce a current state.
 */
export function projectRelationship(
  rows: RelationshipHistoryRow[],
  legacyCache?: { relationshipType: string | null; status: string | null; updatedAt: string } | null,
): RelationshipProjection {
  const correctedIds = new Set(
    rows.filter((r) => r.changeKind === 'CORRECTED' && r.correctsHistoryId).map((r) => r.correctsHistoryId as string),
  );
  const active = rows.filter((r) => !correctedIds.has(r.id));
  const correctedAssertions = rows.filter((r) => correctedIds.has(r.id));

  if (active.length === 0) {
    if (!legacyCache || (!legacyCache.relationshipType && !legacyCache.status)) {
      return { current: null, history: [], correctedAssertions, unresolvedConflicts: [] };
    }
    return {
      current: {
        type: legacyCache.relationshipType,
        status: legacyCache.status,
        authority: 'MIGRATED',
        changedAt: legacyCache.updatedAt,
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: true,
      },
      history: [],
      correctedAssertions,
      unresolvedConflicts: [],
    };
  }

  const candidates = active.filter(isPositiveClaim);
  const history = candidates
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  if (candidates.length === 0) {
    // Everything active is a pure retraction with nothing left standing.
    return { current: null, history: [], correctedAssertions, unresolvedConflicts: [] };
  }

  const maxRank = Math.max(...candidates.map((r) => AUTHORITY_RANK[r.authority]));
  const atMaxAuthority = candidates.filter((r) => AUTHORITY_RANK[r.authority] === maxRank);

  atMaxAuthority.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const winner = atMaxAuthority[0];

  const unresolvedConflicts: string[] = [];
  if (atMaxAuthority.length > 1) {
    const [top, second] = atMaxAuthority;
    const sameInstant = new Date(top.recordedAt).getTime() === new Date(second.recordedAt).getTime();
    const differ = top.toRelationshipType !== second.toRelationshipType || top.toStatus !== second.toStatus;
    if (sameInstant && differ) {
      unresolvedConflicts.push(
        `Two ${top.authority} assertions recorded at the same instant disagree (${top.toRelationshipType}/${top.toStatus} vs ${second.toRelationshipType}/${second.toStatus}) — took ${top.id} arbitrarily.`,
      );
    }
  }

  return {
    current: {
      type: winner.toRelationshipType,
      status: winner.toStatus,
      authority: winner.authority,
      changedAt: winner.changedAt,
      confidence: winner.confidence,
      evidenceIds: winner.evidenceIds,
      isMigratedBaseline: false,
    },
    history,
    correctedAssertions,
    unresolvedConflicts,
  };
}

export interface RecordTransitionInput {
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  toRelationshipType?: string | null;
  toStatus?: string | null;
  changeKind: RelationshipChangeKind;
  authority: MutationAuthority;
  evidenceIds?: string[];
  confidence?: number;
  relationshipId?: string | null;
  correctsHistoryId?: string | null;
  changedAt?: string;
  idempotencyKey?: string;
}

/** Fetch the full ledger for one directed pair (oldest last is fine — the
 *  caller/projector sorts as needed). */
async function fetchHistory(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
): Promise<RelationshipHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('character_relationship_history')
    .select('*')
    .eq('user_id', userId)
    .eq('source_character_id', sourceCharacterId)
    .eq('target_character_id', targetCharacterId)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toHistoryRow);
}

async function fetchLegacyCache(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
): Promise<{ id: string; relationshipType: string | null; status: string | null; updatedAt: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('character_relationships')
    .select('id, relationship_type, status, updated_at')
    .eq('user_id', userId)
    .eq('source_character_id', sourceCharacterId)
    .eq('target_character_id', targetCharacterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    relationshipType: (data.relationship_type as string | null) ?? null,
    status: (data.status as string | null) ?? null,
    updatedAt: data.updated_at as string,
  };
}

/**
 * The read path everything (chat retrieval, characterQueryService, the
 * modal) should call — never read character_relationships.status directly
 * for "current state" going forward.
 */
export async function getCurrentCharacterRelationship(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
): Promise<RelationshipProjection> {
  const history = await fetchHistory(userId, sourceCharacterId, targetCharacterId);
  const legacyCache =
    history.length === 0 ? await fetchLegacyCache(userId, sourceCharacterId, targetCharacterId) : null;
  return projectRelationship(history, legacyCache);
}

/**
 * Governed write: appends one immutable history row, then best-effort syncs
 * the legacy character_relationships cache. The history write is the
 * canonical operation — if the cache sync fails afterward, canonical truth
 * (this table + the projector) is still correct and uncorrupted; only the
 * legacy cache used by not-yet-migrated read paths goes briefly stale,
 * which is self-healing on their next full sync, not a contradictory state.
 *
 * Idempotent when idempotencyKey is supplied: a duplicate write with the
 * same key returns the existing row instead of inserting a second one.
 */
export async function recordRelationshipTransition(
  input: RecordTransitionInput,
): Promise<RelationshipHistoryRow> {
  const nowIso = new Date().toISOString();
  const priorHistory = await fetchHistory(input.userId, input.sourceCharacterId, input.targetCharacterId);
  const priorProjection = projectRelationship(
    priorHistory,
    priorHistory.length === 0
      ? await fetchLegacyCache(input.userId, input.sourceCharacterId, input.targetCharacterId)
      : null,
  );

  const insertPayload = {
    user_id: input.userId,
    source_character_id: input.sourceCharacterId,
    target_character_id: input.targetCharacterId,
    from_relationship_type: priorProjection.current?.type ?? null,
    from_status: priorProjection.current?.status ?? null,
    to_relationship_type: input.toRelationshipType ?? null,
    to_status: input.toStatus ?? null,
    changed_at: input.changedAt ?? nowIso,
    recorded_at: nowIso,
    change_kind: input.changeKind,
    authority: input.authority,
    evidence_ids: input.evidenceIds ?? [],
    confidence: input.confidence ?? null,
    relationship_id: input.relationshipId ?? null,
    corrects_history_id: input.correctsHistoryId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('character_relationship_history')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    // Unique-violation on the idempotency index — the same transition was
    // already recorded; return the existing row rather than duplicating it.
    if (error.code === '23505' && input.idempotencyKey) {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('character_relationship_history')
        .select('*')
        .eq('user_id', input.userId)
        .eq('idempotency_key', input.idempotencyKey)
        .single();
      if (fetchError) throw fetchError;
      return toHistoryRow(existing);
    }
    throw error;
  }

  const row = toHistoryRow(data);

  // Best-effort legacy cache sync — recompute current state from the ledger
  // (not just this one write) so the cache reflects authority-aware truth.
  try {
    const projection = projectRelationship([...priorHistory, row]);
    if (projection.current && !projection.current.isMigratedBaseline) {
      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: projection.current.type,
          status: projection.current.status,
          updated_at: nowIso,
        })
        .eq('user_id', input.userId)
        .eq('source_character_id', input.sourceCharacterId)
        .eq('target_character_id', input.targetCharacterId);
    }
  } catch (cacheError) {
    logger.warn(
      { err: cacheError, sourceCharacterId: input.sourceCharacterId, targetCharacterId: input.targetCharacterId },
      'Relationship history write succeeded but legacy cache sync failed — canonical state is still correct',
    );
  }

  return row;
}

/** "We're not friends anymore" — the relationship happened, then closed. */
export async function endRelationship(input: {
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  authority: MutationAuthority;
  evidenceIds?: string[];
  relationshipId?: string | null;
  idempotencyKey?: string;
}): Promise<RelationshipHistoryRow> {
  const current = await getCurrentCharacterRelationship(input.userId, input.sourceCharacterId, input.targetCharacterId);
  return recordRelationshipTransition({
    ...input,
    toRelationshipType: current.current?.type ?? null,
    toStatus: 'ended',
    changeKind: 'ENDED',
  });
}

/**
 * "We were never friends" — retracts a specific prior assertion. The
 * retracted row stays in the ledger (immutable audit trail) but is excluded
 * from user-facing history by the projector. Optionally asserts a
 * replacement (e.g. "we were actually just acquaintances").
 */
export async function correctRelationshipAssertion(input: {
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  correctsHistoryId: string;
  authority: MutationAuthority;
  toRelationshipType?: string | null;
  toStatus?: string | null;
  evidenceIds?: string[];
  idempotencyKey?: string;
}): Promise<RelationshipHistoryRow> {
  return recordRelationshipTransition({
    ...input,
    changeKind: 'CORRECTED',
  });
}
