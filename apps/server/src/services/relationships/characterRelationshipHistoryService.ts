/**
 * Append-only character relationship history + authority-ranked current cache.
 * character_relationships is a compatibility projection, never the authority.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  canonicalMutationLayer,
  type AtomicCanonicalMutationAdapter,
  type CanonicalMutationEnvelope,
} from '../canonicalMutation';
import { CANONICAL_MUTATION_CONTRACT_VERSION } from '../canonicalMutation/canonicalMutationTypes';
import {
  characterPairKey,
  projectCharacterRelationshipHistory,
  relationshipHistoryIdempotencyKey,
} from './characterRelationshipHistoryProjection';
import {
  RELATIONSHIP_PROJECTION,
  type CharacterRelationshipHistoryRow,
  type CharacterRelationshipWrite,
  type PairRelationshipProjection,
  type RelationshipAssertionKind,
  type RelationshipAuthority,
  type RelationshipValidPrecision,
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

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42P01';
}

function kindForIntent(intent: CharacterRelationshipWrite['intent']): RelationshipAssertionKind {
  if (intent === 'end') return 'ended';
  if (intent === 'correct') return 'corrected_never';
  if (intent === 'destroy') return 'destroyed';
  return 'asserted';
}

function mutationIntentFor(intent: CharacterRelationshipWrite['intent']): CanonicalMutationEnvelope['intent'] {
  if (intent === 'end') return 'RETIRE';
  if (intent === 'correct') return 'INVALIDATE';
  if (intent === 'destroy') return 'RETIRE';
  return 'UPDATE';
}

function toEnvelope(input: CharacterRelationshipWrite, pairKey: string): CanonicalMutationEnvelope {
  return {
    version: CANONICAL_MUTATION_CONTRACT_VERSION,
    userId: input.userId,
    actorId: input.actorId,
    requestorProjection: RELATIONSHIP_PROJECTION,
    target: {
      artifactType: 'character_relationship',
      artifactId: pairKey,
      field: 'relationship_state',
      ownerProjection: RELATIONSHIP_PROJECTION,
    },
    intent: mutationIntentFor(input.intent),
    category: 'RELATIONSHIP',
    previousValue: { pairKey, intent: 'read' },
    proposedValue: {
      pairKey,
      relationshipType: input.relationshipType,
      intent: input.intent,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      validPrecision: input.validPrecision ?? 'unknown',
    },
    authority: input.authority === 'SYSTEM_INFERENCE' ? 'SYSTEM_DERIVED' : input.authority === 'USER_CONFIRMED' ? 'USER_CONFIRMED' : input.authority === 'IMPORTED_SOURCE' ? 'IMPORTED_SOURCE' : 'USER_EXPLICIT',
    evidence: [{
      sourceType: input.sourceMessageId ? 'chat_message' : 'manual',
      sourceId: input.sourceMessageId ?? `relationship:${pairKey}:${input.intent}`,
      relation: input.intent === 'correct' ? 'CORRECTS' : 'SUPPORTS',
    }],
    risk: input.intent === 'destroy' ? 'CRITICAL' : 'LOW',
    reason: input.intent === 'correct' ? 'EXPLICIT_USER_CORRECTION' : input.authority === 'SYSTEM_INFERENCE' ? 'DERIVED_INFERENCE' : 'EXPLICIT_USER_UPDATE',
    affectedProjections: [RELATIONSHIP_PROJECTION, 'character_query', 'working_memory'],
    rationale: input.rationale ?? `${input.intent} ${input.relationshipType}`,
  };
}

function mapHistoryRow(row: Record<string, unknown>): CharacterRelationshipHistoryRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceCharacterId: String(row.source_character_id),
    targetCharacterId: String(row.target_character_id),
    pairKey: String(row.pair_key),
    relationshipType: String(row.relationship_type),
    assertionKind: row.assertion_kind as RelationshipAssertionKind,
    authority: row.authority as RelationshipAuthority,
    recordedAt: String(row.recorded_at),
    validFrom: (row.valid_from as string | null) ?? null,
    validUntil: (row.valid_until as string | null) ?? null,
    validPrecision: (row.valid_precision as RelationshipValidPrecision) ?? 'unknown',
    supersededById: (row.superseded_by_id as string | null) ?? null,
    idempotencyKey: String(row.idempotency_key),
    mutationKey: (row.mutation_key as string | null) ?? null,
    sourceMessageId: (row.source_message_id as string | null) ?? null,
    evidence: (row.evidence as string | null) ?? null,
    confidence: (row.confidence as number | null) ?? null,
  };
}

export async function loadCharacterRelationshipHistory(
  userId: string,
  filter?: { characterId?: string; pairKey?: string },
): Promise<CharacterRelationshipHistoryRow[]> {
  let query = supabaseAdmin
    .from('character_relationship_history')
    .select('*')
    .eq('user_id', userId);
  if (filter?.pairKey) query = query.eq('pair_key', filter.pairKey);
  if (filter?.characterId) {
    query = query.or(
      `source_character_id.eq.${filter.characterId},target_character_id.eq.${filter.characterId}`,
    );
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    logger.warn({ error, userId }, 'character relationship history load failed');
    return [];
  }
  return (data ?? []).map((row) => mapHistoryRow(row as Record<string, unknown>));
}

export async function projectCharacterRelationshipsForUser(
  userId: string,
  filter?: { characterId?: string; pairKey?: string },
): Promise<PairRelationshipProjection[]> {
  const rows = await loadCharacterRelationshipHistory(userId, filter);
  return projectCharacterRelationshipHistory(rows);
}

async function refreshCurrentStateCache(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
  write: CharacterRelationshipWrite,
): Promise<void> {
  const pairKey = characterPairKey(sourceCharacterId, targetCharacterId);
  const projected = await projectCharacterRelationshipsForUser(userId, { pairKey });
  const current = projected[0]?.current ?? [];
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('character_relationships')
    .select('id, relationship_type, status')
    .eq('user_id', userId)
    .or(
      `and(source_character_id.eq.${sourceCharacterId},target_character_id.eq.${targetCharacterId}),and(source_character_id.eq.${targetCharacterId},target_character_id.eq.${sourceCharacterId})`,
    );

  const currentTypes = new Set(current.map((item) => item.relationshipType.toLowerCase()));
  for (const row of existing ?? []) {
    const type = String(row.relationship_type ?? '').toLowerCase();
    if (currentTypes.has(type)) continue;
    const ended = projected[0]?.ended.some((item) => item.relationshipType.toLowerCase() === type);
    const corrected = projected[0]?.correctedNever.some((item) => item.relationshipType.toLowerCase() === type);
    await supabaseAdmin
      .from('character_relationships')
      .update({
        status: corrected ? 'corrected' : ended ? 'ended' : 'inactive',
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
  }

  for (const item of current) {
    const { error } = await supabaseAdmin.from('character_relationships').upsert(
      {
        user_id: userId,
        source_character_id: sourceCharacterId,
        target_character_id: targetCharacterId,
        relationship_type: item.relationshipType,
        status: 'active',
        closeness_score: write.closenessScore ?? null,
        summary: write.summary ?? null,
        inference_status: write.authority === 'SYSTEM_INFERENCE' ? 'inferred' : 'asserted',
        updated_at: now,
        metadata: {
          source: 'relationship_history_projection',
          history_id: item.historyId,
          authority: item.authority,
          valid_from: item.validFrom,
          valid_until: item.validUntil,
          valid_precision: item.validPrecision,
        },
      } as Record<string, unknown>,
      { onConflict: 'user_id,source_character_id,target_character_id,relationship_type' },
    );
    if (error && !isMissingTable(error)) {
      logger.warn({ error, userId, pairKey }, 'character_relationships cache upsert failed');
    }
  }
}

async function applyCompatibilityCacheWrite(input: CharacterRelationshipWrite): Promise<void> {
  const now = new Date().toISOString();
  const pairFilter = `and(source_character_id.eq.${input.sourceCharacterId},target_character_id.eq.${input.targetCharacterId}),and(source_character_id.eq.${input.targetCharacterId},target_character_id.eq.${input.sourceCharacterId})`;
  if (input.intent === 'assert') {
    await supabaseAdmin.from('character_relationships').upsert(
      {
        user_id: input.userId,
        source_character_id: input.sourceCharacterId,
        target_character_id: input.targetCharacterId,
        relationship_type: input.relationshipType,
        status: 'active',
        closeness_score: input.closenessScore ?? null,
        summary: input.summary ?? null,
        updated_at: now,
        metadata: { source: 'relationship_history_fallback', authority: input.authority },
      } as Record<string, unknown>,
      { onConflict: 'user_id,source_character_id,target_character_id,relationship_type' },
    );
    return;
  }
  await supabaseAdmin
    .from('character_relationships')
    .update({
      status: input.intent === 'correct' ? 'corrected' : 'ended',
      updated_at: now,
      metadata: {
        source: 'relationship_history_fallback',
        authority: input.authority,
        intent: input.intent,
      },
    })
    .eq('user_id', input.userId)
    .eq('relationship_type', input.relationshipType)
    .or(pairFilter);
}

export async function invalidateCharacterRelationshipProjection(
  userId: string,
  pairKey: string,
): Promise<{ type: 'RELATIONSHIP_PROJECTION_INVALIDATED'; userId: string; pairKey: string; at: string }> {
  return {
    type: 'RELATIONSHIP_PROJECTION_INVALIDATED',
    userId,
    pairKey,
    at: new Date().toISOString(),
  };
}

async function appendHistoryRow(
  input: CharacterRelationshipWrite,
  mutationKey: string,
): Promise<CharacterRelationshipHistoryRow | null> {
  const pairKey = characterPairKey(input.sourceCharacterId, input.targetCharacterId);
  const assertionKind = kindForIntent(input.intent);
  const validPrecision = input.validPrecision ?? (input.validFrom || input.validUntil ? 'date' : 'unknown');
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const idempotencyKey = relationshipHistoryIdempotencyKey({
    userId: input.userId,
    pairKey,
    relationshipType: input.relationshipType,
    assertionKind,
    authority: input.authority,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    validPrecision,
    sourceMessageId: input.sourceMessageId ?? null,
  });

  const payload = {
    user_id: input.userId,
    source_character_id: input.sourceCharacterId,
    target_character_id: input.targetCharacterId,
    pair_key: pairKey,
    relationship_type: input.relationshipType,
    assertion_kind: assertionKind,
    authority: input.authority,
    recorded_at: recordedAt,
    valid_from: input.validFrom ?? null,
    valid_until: input.validUntil ?? null,
    valid_precision: validPrecision,
    idempotency_key: idempotencyKey,
    mutation_key: mutationKey,
    source_message_id: input.sourceMessageId ?? null,
    evidence: input.evidence ?? null,
    confidence: input.confidence ?? null,
    metadata: { intent: input.intent },
  };

  const { data, error } = await supabaseAdmin
    .from('character_relationship_history')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const { data: existing } = await supabaseAdmin
        .from('character_relationship_history')
        .select('*')
        .eq('user_id', input.userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      return isHistoryRecord(existing) ? mapHistoryRow(existing) : null;
    }
    if (isMissingTable(error)) return null;
    throw error;
  }
  return isHistoryRecord(data) ? mapHistoryRow(data) : null;
}

function isHistoryRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && 'id' in (value as object);
}

export async function applyCharacterRelationshipWrite(
  input: CharacterRelationshipWrite,
): Promise<{
  applied: boolean;
  mutationKey?: string;
  historyId?: string;
  invalidation?: Awaited<ReturnType<typeof invalidateCharacterRelationshipProjection>>;
  reason?: string;
}> {
  if (input.userId !== input.actorId) {
    return { applied: false, reason: 'Actor does not own the relationship.' };
  }
  const pairKey = characterPairKey(input.sourceCharacterId, input.targetCharacterId);
  if (input.intent === 'assert' || input.intent === 'end') {
    const current = await listCurrentCharacterRelationships(input.userId, {
      characterId: input.sourceCharacterId,
    });
    const match = current.find(
      (row) =>
        characterPairKey(row.source_character_id, row.target_character_id) === pairKey &&
        String(row.relationship_type).toLowerCase() === String(input.relationshipType).toLowerCase(),
    );
    if (match) {
      const currentStatus = String(match.status ?? 'active').toLowerCase();
      if (input.intent === 'assert' && !isInactiveCacheStatus(currentStatus)) {
        return { applied: false, reason: 'unchanged_canonical_state' };
      }
      if (input.intent === 'end' && isInactiveCacheStatus(currentStatus)) {
        return { applied: false, reason: 'unchanged_canonical_state' };
      }
    }
  }
  const envelope = toEnvelope(input, pairKey);
  let appendedHistoryId: string | undefined;
  const adapter: AtomicCanonicalMutationAdapter = {
    atomic: true,
    apply: async (decision) => {
      const row = await appendHistoryRow(input, decision.mutationKey);
      appendedHistoryId = row?.id;
      if (row) {
        await refreshCurrentStateCache(input.userId, input.sourceCharacterId, input.targetCharacterId, input);
      } else if (input.authority !== 'SYSTEM_INFERENCE') {
        await applyCompatibilityCacheWrite(input);
      }
      return { mutationId: row?.id ?? decision.mutationKey };
    },
  };

  if (input.intent === 'destroy') {
    if (input.authority !== 'USER_EXPLICIT') {
      return { applied: false, reason: 'Destructive delete requires explicit user intent.' };
    }
    const row = await appendHistoryRow(input, `destructive:${pairKey}`);
    appendedHistoryId = row?.id;
    await supabaseAdmin
      .from('character_relationships')
      .delete()
      .eq('user_id', input.userId)
      .eq('relationship_type', input.relationshipType)
      .or(
        `and(source_character_id.eq.${input.sourceCharacterId},target_character_id.eq.${input.targetCharacterId}),and(source_character_id.eq.${input.targetCharacterId},target_character_id.eq.${input.sourceCharacterId})`,
      );
    return {
      applied: true,
      historyId: row?.id,
      invalidation: await invalidateCharacterRelationshipProjection(input.userId, pairKey),
      reason: 'explicit_destructive_delete',
    };
  }

  const result = await canonicalMutationLayer.apply(envelope, adapter);
  if (!result.applied) {
    if (input.authority === 'SYSTEM_INFERENCE' && input.intent === 'assert') {
      const row = await appendHistoryRow(input, result.mutationKey);
      appendedHistoryId = row?.id;
      if (row) {
        await refreshCurrentStateCache(input.userId, input.sourceCharacterId, input.targetCharacterId, input);
      }
      return {
        applied: Boolean(row),
        mutationKey: result.mutationKey,
        historyId: row?.id,
        invalidation: await invalidateCharacterRelationshipProjection(input.userId, pairKey),
        reason: 'Derived assertion appended to history; current state remains authority-ranked.',
      };
    }
    return { applied: false, mutationKey: result.mutationKey, reason: result.reason };
  }
  return {
    applied: true,
    mutationKey: result.mutationKey,
    historyId: appendedHistoryId,
    invalidation: await invalidateCharacterRelationshipProjection(input.userId, pairKey),
  };
}

function isInactiveCacheStatus(status: string | null | undefined): boolean {
  return ['superseded', 'deleted', 'inactive', 'ended', 'corrected', 'invalid', 'destroyed'].includes(
    String(status ?? 'active').toLowerCase(),
  );
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
