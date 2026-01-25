/**
 * Unified ER Ingestion — One ER-controlled path for all text (chat + journal).
 *
 * Flow: extract → resolve (with cache) → resolvedMap → ER gate → detect
 *       → validate → threshold → writeRelationship (and scopes).
 *
 * No legacy shortcuts. ER schema controls routing.
 */

import { logger } from '../logger';
import type { Entity } from '../types/omegaMemory';
import {
  toErEntityType,
  toStorageEntityType,
  getResolvablePairs,
  hasAnyDirectEdgePossible,
  validateRelationship,
  logValidationFailure,
  ASSERTED_THRESHOLD,
  EPISODIC_THRESHOLD,
  type ExtractedRelationship,
  type ResolvedEntity,
  type TargetTable,
} from '../er/erSchema';
import { writeRelationship } from '../er/writeRelationship';
import { entityRelationshipDetector } from './conversationCentered/entityRelationshipDetector';
import { entityScopeService } from './conversationCentered/entityScopeService';
import { entityResolutionCache } from './entityResolutionCache';
import { omegaMemoryService } from './omegaMemoryService';

const RESOLVE_CHUNK_SIZE = 5;

export type RunERIngestionOpts = {
  memoryId?: string;
  sourceMessageId?: string;
  sourceJournalEntryId?: string;
};

function dedupeByNameAndType(
  candidates: Array<{ name: string; type: string }>
): Array<{ name: string; type: string }> {
  const map = new Map<string, { name: string; type: string }>();
  for (const c of candidates) {
    const key = `${c.name.toLowerCase().trim()}|${c.type}`;
    if (!map.has(key)) map.set(key, c);
  }
  return [...map.values()];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function resolveOne(
  userId: string,
  c: { name: string; type: string }
): Promise<Entity> {
  const cached = await entityResolutionCache.getCachedResolution(userId, c.name);
  if (cached && cached.resolved_entity_id != null && cached.entity_type === c.type) {
    return {
      id: cached.resolved_entity_id,
      user_id: userId,
      type: cached.entity_type as Entity['type'],
      primary_name: cached.entity_name,
      aliases: cached.aliases ?? [],
      created_at: '',
      updated_at: '',
    };
  }
  const resolved = await omegaMemoryService.resolveEntities(userId, [
    { name: c.name, type: c.type as Entity['type'] },
  ]);
  const entity = resolved[0];
  await entityResolutionCache.cacheResolution(userId, {
    entity_name: c.name,
    resolved_entity_id: entity.id,
    entity_type: entity.type,
    confidence: 1,
    aliases: entity.aliases ?? [],
  });
  return entity;
}

async function resolveEntitiesWithCache(
  userId: string,
  candidates: Array<{ name: string; type: string }>
): Promise<Map<string, Entity>> {
  const deduped = dedupeByNameAndType(candidates);
  const map = new Map<string, Entity>();
  const chunks = chunk(deduped, RESOLVE_CHUNK_SIZE);
  for (const ch of chunks) {
    const entities = await Promise.all(ch.map((c) => resolveOne(userId, c)));
    for (const e of entities) {
      map.set(e.id, e);
    }
  }
  return map;
}

function buildResolvedMap(resolved: Map<string, Entity>): Map<string, ResolvedEntity> {
  const m = new Map<string, ResolvedEntity>();
  for (const e of resolved.values()) {
    m.set(e.id, { id: e.id, type: toErEntityType(e.type) });
  }
  return m;
}

function toDetectorEntities(
  resolved: Map<string, Entity>
): Array<{ id: string; name: string; type: 'character' | 'omega_entity' }> {
  return Array.from(resolved.values())
    .map((e) => ({
      id: e.id,
      name: e.primary_name,
      type: toStorageEntityType(toErEntityType(e.type)) as 'character' | 'omega_entity',
    }))
    .filter((e) => e.name);
}

/**
 * Shared ER ingestion for any text. Call from journal and conversation.
 */
export async function runERIngestionForText(
  userId: string,
  text: string,
  opts?: RunERIngestionOpts
): Promise<void> {
  const extracted = await omegaMemoryService.extractEntities(text);
  if (extracted.length < 2) return;

  const resolved = await resolveEntitiesWithCache(userId, extracted);
  if (resolved.size < 2) return;

  const resolvedMap = buildResolvedMap(resolved);

  const pairs = getResolvablePairs(resolvedMap);
  if (!hasAnyDirectEdgePossible(pairs)) return;

  const entitiesWithNames = toDetectorEntities(resolved);
  if (entitiesWithNames.length < 2) return;

  const detection = await entityRelationshipDetector.detectRelationshipsAndScopes(
    userId,
    text,
    entitiesWithNames,
    opts?.sourceMessageId,
    opts?.sourceJournalEntryId
  );

  const ctx = { userId, memoryId: opts?.memoryId };

  for (const rel of detection.relationships) {
    const extractedRel: ExtractedRelationship = {
      fromTempId: rel.fromEntityId,
      toTempId: rel.toEntityId,
      relationship: rel.relationshipType as ExtractedRelationship['relationship'],
      kind: rel.kind,
      confidence: rel.confidence,
    };

    const validation = validateRelationship(extractedRel, resolvedMap);
    if (!validation.ok) {
      logValidationFailure(validation.code, extractedRel);
      continue;
    }

    if (rel.kind === 'ASSERTED' && rel.confidence < ASSERTED_THRESHOLD) continue;
    if (rel.kind === 'EPISODIC' && rel.confidence < EPISODIC_THRESHOLD) continue;

    const targetTable = (validation as { ok: true; targetTable?: TargetTable }).targetTable;
    if (!targetTable) continue;

    await writeRelationship(userId, targetTable, extractedRel, resolvedMap, ctx, {
      scope: rel.scope,
      evidenceSourceIds: opts?.memoryId ? [opts.memoryId] : [],
      evidence: rel.evidence,
    });

    if (rel.scope) {
      await entityScopeService.addEntityToScopeGroup(
        userId,
        rel.fromEntityId,
        rel.fromEntityType,
        rel.scope
      );
      await entityScopeService.addEntityToScopeGroup(
        userId,
        rel.toEntityId,
        rel.toEntityType,
        rel.scope
      );
    }
  }

  for (const scope of detection.scopes) {
    await entityRelationshipDetector.saveScope(userId, scope);
    await entityScopeService.addEntityToScopeGroup(
      userId,
      scope.entityId,
      scope.entityType,
      scope.scope,
      scope.scopeContext
    );
  }
}

/**
 * Journal entry point. Fire-and-forget.
 */
export function ingestJournalEntry(
  userId: string,
  journalEntryId: string,
  text: string
): void {
  runERIngestionForText(userId, text, {
    memoryId: journalEntryId,
    sourceJournalEntryId: journalEntryId,
  }).catch((err) => {
    logger.warn({ err, userId, journalEntryId }, 'Journal ER ingestion failed (non-blocking)');
  });
}

/**
 * Conversation (Step 6.8) entry point. Fire-and-forget.
 */
export function ingestConversationER(userId: string, messageId: string, text: string): void {
  runERIngestionForText(userId, text, {
    memoryId: messageId,
    sourceMessageId: messageId,
  }).catch((err) => {
    logger.debug({ err, userId, messageId }, 'Conversation ER ingestion failed (non-blocking)');
  });
}
