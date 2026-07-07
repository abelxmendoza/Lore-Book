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
import { inferScope } from '../er/scopeInference';
import { writeRelationship } from '../er/writeRelationship';
import { entityRelationshipDetector } from './conversationCentered/entityRelationshipDetector';
import { entityScopeService } from './conversationCentered/entityScopeService';
import { hasPersonProvenanceEvidence } from './characters/audit/characterIdentityGate';
import { entityResolutionCache } from './entityResolutionCache';
import { omegaMemoryService } from './omegaMemoryService';
import { supabaseAdmin } from './supabaseClient';
import { isIndividualPersonName } from '../utils/personNameValidation';

const RESOLVE_CHUNK_SIZE = 5;

/** External origin of the ingested text (e.g. an X post) — stamped onto every entity it creates or references. */
export type ExternalProvenance = {
  provider: string;
  sourceId?: string;
  url?: string;
  postedAt?: string;
  /** Short quote of the original post for context_of_mention. */
  excerpt?: string;
};

/** How much lore an external sync may create on its own. */
export type ExternalLoreIntakeMode =
  /** Only link posts to entities that already exist — never create. */
  | 'reference_only'
  /** Default: reference freely, create at most a couple of well-evidenced new entities per post. */
  | 'conservative'
  /** Never auto-create; new candidates are held for the user to confirm. */
  | 'review_first';

export const DEFAULT_LORE_INTAKE_MODE: ExternalLoreIntakeMode = 'conservative';

export type ExternalEntityRef = { id?: string; name: string; type: string };

/** Receipt of what an external post actually did to the user's lore. */
export type ExternalIngestReport = {
  /** Existing entities the post linked to (stamped, nothing created). */
  referenced: ExternalEntityRef[];
  /** New entities the post created (conservative mode only). */
  created: ExternalEntityRef[];
  /** Viable new candidates held back by the intake mode — user can confirm. */
  heldForReview: ExternalEntityRef[];
};

export type RunERIngestionOpts = {
  memoryId?: string;
  sourceMessageId?: string;
  sourceJournalEntryId?: string;
  provenance?: ExternalProvenance;
  loreIntakeMode?: ExternalLoreIntakeMode;
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
 * Stamp the external origin (e.g. X post) onto an entity's stored record so
 * the UI can link back to the post it came from. Deduped by provider+sourceId,
 * capped, best-effort — never blocks ingestion.
 */
async function stampEntityProvenance(
  userId: string,
  entity: Entity,
  provenance: ExternalProvenance
): Promise<void> {
  const table =
    toStorageEntityType(toErEntityType(entity.type)) === 'character'
      ? 'characters'
      : 'omega_entities';
  try {
    const { data: row } =
      table === 'characters'
        ? await supabaseAdmin
            .from('characters')
            .select('metadata, context_of_mention')
            .eq('id', entity.id)
            .eq('user_id', userId)
            .maybeSingle()
        : await supabaseAdmin
            .from('omega_entities')
            .select('metadata')
            .eq('id', entity.id)
            .eq('user_id', userId)
            .maybeSingle();
    if (!row) return;

    const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}) };
    const sources = Array.isArray(metadata.external_sources)
      ? [...(metadata.external_sources as Array<Record<string, unknown>>)]
      : [];
    const exists = sources.some(
      (s) => s.provider === provenance.provider && s.sourceId === provenance.sourceId
    );
    if (exists) return;
    sources.push({
      provider: provenance.provider,
      sourceId: provenance.sourceId,
      url: provenance.url,
      postedAt: provenance.postedAt,
      excerpt: provenance.excerpt?.slice(0, 240),
      recordedAt: new Date().toISOString(),
    });
    metadata.external_sources = sources.slice(-20);

    const update: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (
      table === 'characters' &&
      !(row as { context_of_mention?: string | null }).context_of_mention &&
      provenance.excerpt
    ) {
      update.context_of_mention = provenance.excerpt.slice(0, 500);
    }
    await supabaseAdmin.from(table).update(update).eq('id', entity.id).eq('user_id', userId);
  } catch (err) {
    logger.warn({ err, entityId: entity.id, table }, 'external provenance stamp skipped');
  }
}

/**
 * How many NEW entities a single external post may create. External posts are
 * low-context one-liners; they may freely REFERENCE existing lore, but must
 * not flood the books with new cards.
 */
const EXTERNAL_POST_NEW_ENTITY_CAP = 2;

/**
 * Candidate gate for externally-sourced text (X posts):
 * - Candidates matching EXISTING entities always pass (reference, no creation).
 * - Viable new candidates route by intake mode: created (conservative, within
 *   the per-post budget), or held for the user to confirm.
 * - New PEOPLE always need a person-shaped name plus person evidence in the
 *   post itself — junk person candidates are dropped in every mode.
 */
export async function partitionExternalPostCandidates<T extends { name: string; type: string }>(
  userId: string,
  candidates: T[],
  postText: string,
  mode: ExternalLoreIntakeMode
): Promise<{ existing: T[]; fresh: T[]; held: T[] }> {
  const existing: T[] = [];
  const fresh: T[] = [];
  const held: T[] = [];
  let newBudget = mode === 'conservative' ? EXTERNAL_POST_NEW_ENTITY_CAP : 0;

  for (const candidate of candidates) {
    const cached = await entityResolutionCache
      .getCachedResolution(userId, candidate.name)
      .catch(() => null);
    if (cached?.resolved_entity_id) {
      existing.push(candidate);
      continue;
    }
    const found = await omegaMemoryService
      .findEntityByNameOrAlias(userId, candidate.name, candidate.type as Entity['type'])
      .catch(() => null);
    if (found) {
      existing.push(candidate);
      continue;
    }

    // Quality floor applies in every mode — junk person candidates never
    // surface, not even as review suggestions.
    if (candidate.type === 'PERSON') {
      if (!isIndividualPersonName(candidate.name) || !hasPersonProvenanceEvidence(postText)) {
        logger.debug({ userId, name: candidate.name }, 'external post: person candidate lacks evidence — dropped');
        continue;
      }
    }

    if (newBudget > 0) {
      fresh.push(candidate);
      newBudget -= 1;
    } else {
      held.push(candidate);
    }
  }

  return { existing, fresh, held };
}

/**
 * User-confirmed creation of a held external candidate ("Add to lore" from the
 * sync receipt). Resolves/creates through the normal ER path and stamps the
 * originating post.
 */
export async function confirmExternalLoreCandidate(
  userId: string,
  candidate: { name: string; type: string },
  provenance: ExternalProvenance
): Promise<ExternalEntityRef> {
  const resolved = await omegaMemoryService.resolveEntities(userId, [
    { name: candidate.name, type: candidate.type as Entity['type'] },
  ]);
  const entity = resolved[0];
  await entityResolutionCache.cacheResolution(userId, {
    entity_name: candidate.name,
    resolved_entity_id: entity.id,
    entity_type: entity.type,
    confidence: 1,
    aliases: entity.aliases ?? [],
  });
  await stampEntityProvenance(userId, entity, provenance);
  return { id: entity.id, name: entity.primary_name, type: entity.type };
}

/**
 * Shared ER ingestion for any text. Call from journal and conversation.
 */
export async function runERIngestionForText(
  userId: string,
  text: string,
  opts?: RunERIngestionOpts
): Promise<ExternalIngestReport | undefined> {
  const report: ExternalIngestReport | undefined = opts?.provenance
    ? { referenced: [], created: [], heldForReview: [] }
    : undefined;

  let extracted = await omegaMemoryService.extractEntities(text);
  // Relationship detection needs 2+ entities, but externally-sourced text
  // (X posts) should still resolve + stamp a single mentioned entity.
  if (extracted.length === 0) return report;
  if (extracted.length < 2 && !opts?.provenance) return report;

  // External posts get the intake gate: reference existing lore freely; new
  // entity creation routes by the user's lore intake mode.
  let freshNames = new Set<string>();
  if (opts?.provenance && report) {
    const mode = opts.loreIntakeMode ?? DEFAULT_LORE_INTAKE_MODE;
    const partition = await partitionExternalPostCandidates(userId, extracted, text, mode);
    report.heldForReview = partition.held.map((c) => ({ name: c.name, type: c.type }));
    freshNames = new Set(partition.fresh.map((c) => c.name.toLowerCase().trim()));
    extracted = [...partition.existing, ...partition.fresh];
    if (extracted.length === 0) return report;
  }

  const resolved = await resolveEntitiesWithCache(userId, extracted);
  if (resolved.size === 0) return report;

  if (opts?.provenance && report) {
    for (const entity of resolved.values()) {
      await stampEntityProvenance(userId, entity, opts.provenance);
      const ref: ExternalEntityRef = { id: entity.id, name: entity.primary_name, type: entity.type };
      if (freshNames.has(entity.primary_name?.toLowerCase().trim() ?? '')) {
        report.created.push(ref);
      } else {
        report.referenced.push(ref);
      }
    }
  }
  if (resolved.size < 2) return report;

  const resolvedMap = buildResolvedMap(resolved);

  const pairs = getResolvablePairs(resolvedMap);
  if (!hasAnyDirectEdgePossible(pairs)) return report;

  const entitiesWithNames = toDetectorEntities(resolved);
  if (entitiesWithNames.length < 2) return report;

  const detection = await entityRelationshipDetector.detectRelationshipsAndScopes(
    userId,
    text,
    entitiesWithNames,
    opts?.sourceMessageId,
    opts?.sourceJournalEntryId
  );

  const scope = inferScope(text);
  const ctx = { userId, memoryId: opts?.memoryId, scope };

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
 * External-post entry point (X/Twitter etc.). AWAITED — the caller reports
 * how much lore came out of the sync — and stamps every touched entity with
 * the originating post (provider, sourceId, url).
 */
export async function ingestExternalPost(
  userId: string,
  journalEntryId: string,
  text: string,
  provenance: ExternalProvenance,
  loreIntakeMode: ExternalLoreIntakeMode = DEFAULT_LORE_INTAKE_MODE
): Promise<ExternalIngestReport | undefined> {
  return runERIngestionForText(userId, text, {
    memoryId: journalEntryId,
    sourceJournalEntryId: journalEntryId,
    provenance,
    loreIntakeMode,
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
