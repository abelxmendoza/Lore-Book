/**
 * Bulk read path for character relationship history.
 *
 * Writes stay on characterRelationshipAuthorityService. This module loads the
 * existing `character_relationship_history` ledger, maps it onto the
 * lane-aware projector, and lists current open states (with a legacy
 * `character_relationships` fallback for pairs that have no history yet).
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { MutationAuthority } from '../canonicalMutation/canonicalMutationTypes';
import type { RelationshipChangeKind } from '../characters/characterRelationshipAuthorityService';
import {
  characterPairKey,
  mapAuthorityHistoryRow,
  projectCharacterRelationshipHistory,
} from './characterRelationshipHistoryProjection';
import type {
  CharacterRelationshipHistoryRow,
  PairRelationshipProjection,
} from './characterRelationshipHistoryTypes';

export type CurrentRelationshipRow = {
  id?: string;
  relationship_type: string;
  status: string;
  source_character_id: string;
  target_character_id: string;
  metadata: Record<string, unknown>;
  updated_at?: string;
  strength?: number | null;
  closeness_score?: number | null;
  summary?: string | null;
};

function isInactiveCacheStatus(status: string | null | undefined): boolean {
  return ['superseded', 'deleted', 'inactive', 'ended', 'corrected', 'invalid', 'destroyed'].includes(
    String(status ?? 'active').toLowerCase(),
  );
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

function mapDbHistoryRow(row: Record<string, unknown>): CharacterRelationshipHistoryRow {
  return mapAuthorityHistoryRow({
    id: String(row.id),
    userId: String(row.user_id),
    sourceCharacterId: String(row.source_character_id),
    targetCharacterId: String(row.target_character_id),
    fromRelationshipType: asString(row.from_relationship_type),
    fromStatus: asString(row.from_status),
    toRelationshipType: asString(row.to_relationship_type),
    toStatus: asString(row.to_status),
    changedAt: String(row.changed_at ?? row.recorded_at),
    recordedAt: String(row.recorded_at),
    validUntil: asString(row.valid_until),
    changeKind: row.change_kind as RelationshipChangeKind,
    authority: row.authority as MutationAuthority,
    evidenceIds: Array.isArray(row.evidence_ids) ? (row.evidence_ids as string[]) : [],
    confidence: (row.confidence as number | null) ?? null,
    relationshipId: asString(row.relationship_id),
    correctsHistoryId: asString(row.corrects_history_id),
    idempotencyKey: asString(row.idempotency_key),
  });
}

export async function loadCharacterRelationshipHistory(
  userId: string,
  filter?: { characterId?: string; pairKey?: string },
): Promise<CharacterRelationshipHistoryRow[]> {
  let query = supabaseAdmin
    .from('character_relationship_history')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true });
  if (filter?.characterId) {
    query = query.or(
      `source_character_id.eq.${filter.characterId},target_character_id.eq.${filter.characterId}`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.warn({ error, userId }, 'character relationship history load failed');
    return [];
  }
  const mapped = (data ?? []).map((row) => mapDbHistoryRow(row as Record<string, unknown>));
  if (!filter?.pairKey) return mapped;
  return mapped.filter((row) => row.pairKey === filter.pairKey);
}

export async function projectCharacterRelationshipsForUser(
  userId: string,
  filter?: { characterId?: string; pairKey?: string },
): Promise<PairRelationshipProjection[]> {
  const rows = await loadCharacterRelationshipHistory(userId, filter);
  return projectCharacterRelationshipHistory(rows);
}

async function loadCompatibilityCacheRows(
  userId: string,
  filter?: { characterId?: string },
): Promise<CurrentRelationshipRow[]> {
  let query = supabaseAdmin
    .from('character_relationships')
    .select('id, relationship_type, status, source_character_id, target_character_id, metadata, updated_at, strength, closeness_score, summary')
    .eq('user_id', userId);
  if (filter?.characterId) {
    query = query.or(
      `source_character_id.eq.${filter.characterId},target_character_id.eq.${filter.characterId}`,
    );
  }
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as CurrentRelationshipRow[];
}

/**
 * Current open relationship lanes for a user, with the legacy cache filling
 * pairs that have no history rows yet. Ended / corrected history is not
 * resurrected from the cache.
 */
export async function listCurrentCharacterRelationships(
  userId: string,
  filter?: { characterId?: string },
): Promise<CurrentRelationshipRow[]> {
  const [history, cache] = await Promise.all([
    loadCharacterRelationshipHistory(userId, filter),
    loadCompatibilityCacheRows(userId, filter),
  ]);
  const cacheByPairType = new Map<string, CurrentRelationshipRow>();
  for (const row of cache) {
    const key = `${characterPairKey(row.source_character_id, row.target_character_id)}|${String(row.relationship_type).toLowerCase()}`;
    cacheByPairType.set(key, row);
  }

  const projected = projectCharacterRelationshipHistory(history);
  const historyPairKeys = new Set(projected.map((pair) => pair.pairKey));
  const rows: CurrentRelationshipRow[] = [];

  for (const pair of projected) {
    for (const current of pair.current) {
      const cached = cacheByPairType.get(`${pair.pairKey}|${current.relationshipType.toLowerCase()}`);
      rows.push({
        id: cached?.id ?? current.historyId,
        relationship_type: current.relationshipType,
        status: 'active',
        source_character_id: cached?.source_character_id ?? pair.sourceCharacterId,
        target_character_id: cached?.target_character_id ?? pair.targetCharacterId,
        metadata: {
          ...(cached?.metadata ?? {}),
          authority: current.authority,
          valid_from: current.validFrom,
          valid_until: current.validUntil,
          valid_precision: current.validPrecision,
          history_id: current.historyId,
        },
        updated_at: cached?.updated_at ?? current.validFrom ?? undefined,
        strength: cached?.strength,
        closeness_score: cached?.closeness_score,
        summary: cached?.summary,
      });
    }
  }

  for (const row of cache) {
    const pairKey = characterPairKey(row.source_character_id, row.target_character_id);
    if (historyPairKeys.has(pairKey)) continue;
    if (isInactiveCacheStatus(row.status)) continue;
    rows.push(row);
  }
  return rows;
}
