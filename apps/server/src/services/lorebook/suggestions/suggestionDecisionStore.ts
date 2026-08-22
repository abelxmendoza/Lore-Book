/**
 * Persist / load user suggestion decisions from existing tables.
 * No new runtime table required. Organizations dismissal_stats needs a
 * CHECK expansion (migration written, not applied) — ledger is the fallback.
 */

import { logger } from '../../../logger';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { supabaseAdmin } from '../../supabaseClient';
import { identityLedgerService } from '../../identity/identityLedgerService';
import type { IdentityMutationRow } from '../../identity/identityLedgerService';
import type { EntityLearningLesson } from '../../entityLearningService';
import { normalizeSuggestionDismissalName } from '../../suggestionDismissalService';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import {
  addSuggestionDecision,
  emptySuggestionDecisionIndex,
  type SuggestionDecisionIndex,
} from './suggestionDecisionIndex';
import type { SuggestionDecision } from './suggestionDecisionTypes';
import { isWeakIdentityRejection } from './suggestionDecisionIndex';

const LEARNING_TYPES = ['ENTITY_MERGED', 'MERGE_REJECTED', 'ALIAS_ADDED', 'TRUTH_STATE_CHANGED', 'CONFIDENCE_CHANGED'] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function domainFromEntityType(entityType: string): LoreBookDomain {
  if (entityType === 'organization' || entityType === 'group') return 'organizations';
  if (entityType === 'character' || entityType === 'person') return 'characters';
  if (entityType === 'location' || entityType === 'place') return 'locations';
  if (entityType === 'skill') return 'skills';
  if (entityType === 'project') return 'projects';
  if (entityType === 'quest') return 'quests';
  return (entityType as LoreBookDomain) || 'organizations';
}

function lessonToDecision(lesson: EntityLearningLesson, createdAt: string, source: 'USER' | 'SYSTEM'): SuggestionDecision | null {
  const domain = (lesson.domain as LoreBookDomain) || 'organizations';
  const normalizedKey = lesson.normalizedPhrase || normalizeNameKey(lesson.phrase ?? lesson.alias ?? '');
  if (!normalizedKey) return null;
  if (lesson.lessonType === 'alias_equivalence' || lesson.lessonType === 'canonical_name_preference' || lesson.lessonType === 'duplicate_pattern') {
    return {
      type: lesson.lessonType === 'alias_equivalence' ? 'ALIAS_CONFIRMED' : 'MERGED_INTO',
      domain,
      normalizedKey,
      canonicalId: lesson.canonicalEntityId,
      canonicalName: lesson.canonicalName,
      scope: 'entity',
      source,
      createdAt,
      reason: lesson.reason,
      evidenceStrength: 'strong',
    };
  }
  if (lesson.lessonType === 'suppression_rule' || lesson.lessonType === 'false_positive') {
    return {
      type: 'REJECTED_CANDIDATE',
      domain,
      normalizedKey,
      scope: 'book',
      source,
      createdAt,
      reason: lesson.reason,
      evidenceStrength: isWeakIdentityRejection(normalizedKey, lesson.phrase) ? 'weak' : 'strong',
    };
  }
  return null;
}

function mutationToDecisions(row: IdentityMutationRow): SuggestionDecision[] {
  const createdAt = row.created_at;
  const source: 'USER' | 'SYSTEM' = row.source === 'USER' ? 'USER' : 'SYSTEM';
  const metadata = asRecord(row.metadata);
  const lessons = Array.isArray(metadata.lessons) ? (metadata.lessons as EntityLearningLesson[]) : [];
  const fromLessons = lessons.map((lesson) => lessonToDecision(lesson, createdAt, source)).filter(Boolean) as SuggestionDecision[];

  if (row.mutation_type === 'MERGE_REJECTED') {
    const next = asRecord(row.new_value);
    const otherId = String(next.not_same_person ?? next.relatedId ?? '');
    if (row.entity_id && otherId) {
      fromLessons.push({
        type: 'NOT_SAME_ENTITY',
        domain: domainFromEntityType(row.entity_type),
        normalizedKey: normalizeNameKey(String(next.leftName ?? row.entity_id)),
        canonicalId: row.entity_id,
        relatedId: otherId,
        scope: 'entity',
        source,
        createdAt,
        reason: row.reason ?? 'not_same_entity',
        evidenceStrength: 'strong',
      });
    }
  }

  if (row.mutation_type === 'ENTITY_MERGED') {
    const prev = asRecord(row.previous_value);
    const next = asRecord(row.new_value);
    const sourceName = String(prev.name ?? prev.sourceName ?? '');
    const canonicalName = String(next.canonical_name ?? next.canonicalName ?? '');
    if (sourceName) {
      fromLessons.push({
        type: 'MERGED_INTO',
        domain: domainFromEntityType(row.entity_type),
        normalizedKey: normalizeNameKey(sourceName),
        canonicalId: String(next.id ?? row.entity_id),
        canonicalName: canonicalName || undefined,
        scope: 'entity',
        source,
        createdAt,
        reason: row.reason ?? 'merged',
        evidenceStrength: 'strong',
      });
    }
  }

  if (row.mutation_type === 'TRUTH_STATE_CHANGED') {
    const next = asRecord(row.new_value);
    const canonicalType = String(next.canonicalType ?? next.type ?? next.group_type ?? '');
    if (canonicalType && row.entity_id) {
      fromLessons.push({
        type: 'TYPE_CORRECTED',
        domain: domainFromEntityType(row.entity_type),
        normalizedKey: normalizeNameKey(String(next.name ?? row.entity_id)),
        canonicalId: row.entity_id,
        canonicalType,
        scope: 'entity',
        source,
        createdAt,
        reason: row.reason ?? 'type_corrected',
        evidenceStrength: 'strong',
      });
    }
  }

  return fromLessons;
}

let storeLoadCount = 0;

export function suggestionDecisionStoreLoadCount(): number {
  return storeLoadCount;
}

export function resetSuggestionDecisionStoreLoadCount(): void {
  storeLoadCount = 0;
}

export type SuggestionDecisionLoadResult = {
  index: SuggestionDecisionIndex;
  status: 'ok' | 'degraded';
  successfulLoads: number;
  failedLoads: number;
};

async function loadRows<T>(
  label: string,
  work: () => Promise<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; failed: boolean }> {
  try {
    const res = await work();
    if (res.error) {
      logger.debug({ err: res.error, label }, 'suggestion decision table load failed');
      return { rows: [], failed: true };
    }
    return { rows: res.data ?? [], failed: false };
  } catch (err) {
    logger.debug({ err, label }, 'suggestion decision table load threw');
    return { rows: [], failed: true };
  }
}

export async function loadSuggestionDecisionResult(userId: string): Promise<SuggestionDecisionLoadResult> {
  const index = emptySuggestionDecisionIndex();
  index.loadCount = 1;
  storeLoadCount += 1;

  const [stats, mutations, groupRejected, deletions] = await Promise.all([
    loadRows('suggestion_dismissal_stats', async () =>
      supabaseAdmin
        .from('suggestion_dismissal_stats')
        .select('book_domain, normalized_name, is_permanent, last_dismissed_at, dismiss_count')
        .eq('user_id', userId)
        .eq('is_permanent', true)
        .limit(400),
    ),
    loadRows('identity_mutations', async () =>
      supabaseAdmin
        .from('identity_mutations')
        .select('id, user_id, entity_id, entity_type, mutation_type, previous_value, new_value, reason, confidence, source, metadata, created_at')
        .eq('user_id', userId)
        .in('mutation_type', [...LEARNING_TYPES])
        .order('created_at', { ascending: false })
        .limit(400),
    ),
    loadRows('group_candidates', async () =>
      supabaseAdmin
        .from('group_candidates')
        .select('proposed_name, updated_at')
        .eq('user_id', userId)
        .eq('status', 'rejected')
        .limit(200),
    ),
    loadRows('entity_deletion_events', async () =>
      supabaseAdmin
        .from('entity_deletion_events')
        .select('entity_name, normalized_keys, deletion_kind, created_at')
        .eq('user_id', userId)
        .eq('entity_type', 'character')
        .eq('deletion_kind', 'permanent')
        .order('created_at', { ascending: false })
        .limit(400),
    ),
  ]);

  const failedLoads = [stats, mutations, groupRejected, deletions].filter((part) => part.failed).length;
  const successfulLoads = 4 - failedLoads;

  for (const row of stats.rows as Array<{ book_domain: string; normalized_name: string; last_dismissed_at?: string }>) {
    addSuggestionDecision(index, {
      type: 'REJECTED_CANDIDATE',
      domain: row.book_domain as LoreBookDomain,
      normalizedKey: row.normalized_name,
      scope: 'book',
      source: 'USER',
      createdAt: row.last_dismissed_at ?? new Date().toISOString(),
      reason: 'permanent_suggestion_suppression',
      evidenceStrength: isWeakIdentityRejection(row.normalized_name) ? 'weak' : 'strong',
    });
  }

  for (const row of mutations.rows as IdentityMutationRow[]) {
    for (const decision of mutationToDecisions(row)) addSuggestionDecision(index, decision);
  }

  for (const row of groupRejected.rows as Array<{ proposed_name?: string; updated_at?: string }>) {
    const name = String(row.proposed_name ?? '').trim();
    if (!name) continue;
    addSuggestionDecision(index, {
      type: 'REJECTED_CANDIDATE',
      domain: 'organizations',
      normalizedKey: normalizeNameKey(name),
      scope: 'book',
      source: 'USER',
      createdAt: row.updated_at ?? new Date().toISOString(),
      reason: 'group_candidate_rejected',
      evidenceStrength: 'strong',
    });
  }

  for (const row of deletions.rows as Array<{
    entity_name?: string;
    normalized_keys?: string[];
    created_at?: string;
  }>) {
    const keys = Array.isArray(row.normalized_keys)
      ? row.normalized_keys
      : [normalizeNameKey(String(row.entity_name ?? ''))];
    for (const key of keys) {
      const normalizedKey = normalizeNameKey(String(key ?? ''));
      if (!normalizedKey || normalizedKey.length < 2) continue;
      addSuggestionDecision(index, {
        type: 'REJECTED_CANDIDATE',
        domain: 'characters',
        normalizedKey,
        scope: 'book',
        source: 'USER',
        createdAt: row.created_at ?? new Date().toISOString(),
        reason: 'permanent_entity_deletion',
        evidenceStrength: isWeakIdentityRejection(normalizedKey, row.entity_name) ? 'weak' : 'strong',
      });
    }
  }

  const status: 'ok' | 'degraded' = failedLoads > 0 && successfulLoads === 0 ? 'degraded' : 'ok';
  if (status === 'degraded') {
    logger.warn({ userId, failedLoads }, 'suggestion decision index degraded — machine CREATE blocked');
  }
  return { index, status, successfulLoads, failedLoads };
}

export async function loadSuggestionDecisionIndex(userId: string): Promise<SuggestionDecisionIndex> {
  return (await loadSuggestionDecisionResult(userId)).index;
}

export async function recordRejectedCandidate(input: {
  userId: string;
  domain: LoreBookDomain;
  name: string;
  reason?: string;
  sourceSuggestionId?: string | null;
}): Promise<void> {
  const normalizedKey =
    input.domain === 'projects' || input.domain === 'skills'
      ? normalizeSuggestionDismissalName(input.domain === 'projects' ? 'projects' : 'skills', input.name)
      : normalizeNameKey(input.name);
  if (!normalizedKey) return;

  await identityLedgerService.recordMutation({
    userId: input.userId,
    entityId: `suggestion:${input.domain}:${normalizedKey}`,
    entityType: input.domain === 'organizations' || input.domain === 'groups' ? 'organization' : input.domain.replace(/s$/, ''),
    mutationType: 'CONFIDENCE_CHANGED',
    previousValue: { visible: true },
    newValue: { visible: false, isPermanent: true },
    reason: input.reason ?? `Dismissed ${input.domain} suggestion "${input.name}"`,
    source: 'USER',
    metadata: {
      learning_event: true,
      operation_type: 'dismiss',
      lessons: [
        {
          lessonType: 'suppression_rule',
          domain: input.domain,
          phrase: input.name,
          normalizedPhrase: normalizedKey,
          strength: 5,
          reason: input.reason ?? 'user_dismissed_suggestion',
        },
      ],
    },
  });
}

export async function recordTypeCorrection(input: {
  userId: string;
  domain: LoreBookDomain;
  entityId: string;
  name: string;
  canonicalType: string;
  previousType?: string;
}): Promise<void> {
  await identityLedgerService.recordMutation({
    userId: input.userId,
    entityId: input.entityId,
    entityType: input.domain === 'organizations' ? 'organization' : input.domain.replace(/s$/, ''),
    mutationType: 'TRUTH_STATE_CHANGED',
    previousValue: { type: input.previousType },
    newValue: { name: input.name, canonicalType: input.canonicalType, type: input.canonicalType },
    reason: `User set ${input.name} type to ${input.canonicalType}`,
    source: 'USER',
    metadata: { learning_event: true, operation_type: 'type_correction' },
  });
}

export async function recordNotSameEntities(input: {
  userId: string;
  leftId: string;
  rightId: string;
  domain?: LoreBookDomain;
}): Promise<void> {
  await identityLedgerService.recordMutation({
    userId: input.userId,
    entityId: input.leftId,
    entityType: 'character',
    mutationType: 'MERGE_REJECTED',
    newValue: { not_same_person: input.rightId },
    reason: 'User marked pair as distinct',
    source: 'USER',
  });
}

const PENDING_TABLES: Array<{ domain: LoreBookDomain; table: string; nameColumn: string; statusColumn: string; statusValue: string }> = [
  { domain: 'skills', table: 'skill_suggestions', nameColumn: 'skill_name', statusColumn: 'status', statusValue: 'rejected' },
  { domain: 'projects', table: 'project_suggestions', nameColumn: 'name', statusColumn: 'status_row', statusValue: 'rejected' },
  { domain: 'quests', table: 'quest_suggestions', nameColumn: 'title', statusColumn: 'status', statusValue: 'rejected' },
  { domain: 'organizations', table: 'organization_suggestions', nameColumn: 'name', statusColumn: 'status_row', statusValue: 'rejected' },
];

export async function resolvePendingSuggestions(input: {
  userId: string;
  domain: LoreBookDomain;
  names: string[];
  status?: 'rejected' | 'confirmed';
}): Promise<number> {
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return 0;
  const keys = new Set(names.map((n) => normalizeNameKey(n)));
  let updated = 0;

  if (input.domain === 'organizations' || input.domain === 'groups') {
    const { data: candidates } = await supabaseAdmin
      .from('group_candidates')
      .select('id, proposed_name')
      .eq('user_id', input.userId)
      .eq('status', 'pending');
    const ids = (candidates ?? [])
      .filter((row) => keys.has(normalizeNameKey(String(row.proposed_name ?? ''))))
      .map((row) => row.id);
    if (ids.length > 0) {
      await supabaseAdmin
        .from('group_candidates')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('user_id', input.userId)
        .in('id', ids);
      updated += ids.length;
    }
  }

  for (const spec of PENDING_TABLES) {
    if (spec.domain !== input.domain && !(input.domain === 'groups' && spec.domain === 'organizations')) continue;
    const { data: rows } = await supabaseAdmin
      .from(spec.table)
      .select(`id, ${spec.nameColumn}`)
      .eq('user_id', input.userId)
      .eq(spec.statusColumn, 'pending');
    const typedRows = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    const ids = typedRows
      .filter((row) => keys.has(normalizeNameKey(String(row[spec.nameColumn] ?? ''))))
      .map((row) => row.id as string);
    if (ids.length === 0) continue;
    await supabaseAdmin
      .from(spec.table)
      .update({ [spec.statusColumn]: input.status ?? spec.statusValue, updated_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .in('id', ids);
    updated += ids.length;
  }

  return updated;
}
