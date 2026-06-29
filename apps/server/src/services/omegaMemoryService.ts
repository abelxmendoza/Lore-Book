/**
 * OMEGA MEMORY ENGINE — Core Service
 * Time-aware, truth-seeking knowledge system
 * Enhanced with LLM, semantic similarity, evidence scoring, and temporal reasoning
 */

import { createHash } from 'node:crypto';

import { config } from '../config';
import { AI_THRESHOLDS } from '../config/aiThresholds';
import { logger } from '../logger';
import { assertOmegaEntityOwned, TenantAccessError } from '../lib/tenantOwnership';
import {
  PRIORS, updateBelief, beliefStats, fromFloat, serializeBelief, deserializeBelief,
} from './bayesian/beliefUpdater';
import { openai } from '../lib/openai';
import { jaroWinkler } from '../utils/jaroWinkler';
import { normalizeNameKey } from '../utils/nameNormalization';
import { classifyEntity, toOmegaType } from './entities/entityClassifier';
import { expandEntityCandidates } from './kinship/multiEntitySplitter';
import { extractKinshipMentions } from './kinship/kinshipGlossary';
import { resolveWithCore } from './entities/entityResolutionBridge';
import { evaluateEntityCandidates } from './ontology/entityCandidateGate';
import type { ResolutionContext } from './entities/entityResolutionCore';
import type {
  Entity,
  Claim,
  Relationship,
  Evidence,
  EntityType,
  ClaimSource,
  RankedClaim,
  EntitySummary,
  UpdateSuggestion,
  IngestionResult,
} from '../types/omegaMemory';

import { correctionTracker } from './activeLearning/correctionTracker';
import { characterAuthorityService } from './characterAuthorityService';
import { queueClaimThroughMrq } from './claimGovernanceBridge';
import { continuityService } from './continuityService';
import { embeddingService } from './embeddingService';
import { provenanceEdgeService } from './provenance/provenanceEdgeService';
import { supabaseAdmin } from './supabaseClient';

function uniqueEntities<T extends { name: string; type: EntityType; bornConfirmed?: boolean }>(
  entities: T[]
): T[] {
  const byKey = new Map<string, T>();
  for (const entity of entities) {
    const key = `${normalizeNameKey(entity.name)}:${entity.type}`;
    const existing = byKey.get(key);
    if (existing) {
      // A later mention of the same name may carry the recall-active signal the
      // first occurrence lacked — OR it in rather than dropping the duplicate.
      if (entity.bornConfirmed) existing.bornConfirmed = true;
      continue;
    }
    byKey.set(key, { ...entity });
  }
  return [...byKey.values()];
}

/**
 * Normalize the LLM-provided entity type to a valid EntityType. Used only as a
 * fallback when the deterministic classifier is UNKNOWN — so a venue/org/event
 * the LLM correctly typed is NOT force-defaulted to PERSON (which polluted the
 * graph: "Club Bar Sinister"/"Evoekore Entertainment"/bands all became people).
 * Anything outside the known set stays UNKNOWN and is dropped, so generic tokens
 * ("band", "park", "scene") fall out instead of becoming PERSON.
 */
const LLM_ENTITY_TYPES = new Set<EntityType>(['PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT']);
function llmEntityType(raw: unknown): EntityType {
  const t = typeof raw === 'string' ? raw.toUpperCase().trim() : '';
  return (LLM_ENTITY_TYPES.has(t as EntityType) ? t : 'UNKNOWN') as EntityType;
}

// All omega_entities columns EXCEPT the 1536-dim `embedding` (~6KB/row on the
// wire). Resolution read paths never use the vector — semantic matching runs
// server-side in the match_omega_entities RPC — so fetching it on every
// per-message batch (up to 500 rows) was a large, pure-waste egress cost.
const OMEGA_ENTITY_COLS =
  'id, user_id, type, primary_name, aliases, created_at, updated_at, metadata, mention_count, mention_status, entity_type';

// Minimum Jaro-Winkler similarity between a resolved mention and one of an
// entity's known names before that mention is auto-registered as an alias.
// Blocks distinct people from snowballing into one entity's alias list (the
// "Hell Fairy" over-merge) while still allowing typos/nicknames that share most
// characters ("Sara"→"Sarah", "Jeremy"→"Jerry"). Conservative on purpose.
export const OMEGA_ALIAS_MIN_SIMILARITY = 0.72;

/**
 * Whether `candidate` is similar enough to one of an entity's known names to be
 * auto-registered as an alias on the resolve path. A wholly dissimilar name is
 * almost always a mis-resolution of a DISTINCT person and must not pollute the
 * alias list (root cause of the catastrophic "Hell Fairy" 18-alias collapse).
 */
export function isPlausibleAutoAlias(
  knownNames: string[],
  candidate: string,
  minSimilarity = OMEGA_ALIAS_MIN_SIMILARITY,
): boolean {
  const c = candidate.toLowerCase().trim();
  if (!c) return false;
  return knownNames
    .filter(Boolean)
    .some((known) => jaroWinkler(c, known.toLowerCase().trim()) >= minSimilarity);
}

// All omega_claims columns EXCEPT the 1536-dim `embedding`. The vector is only
// consumed by conflictDetected() (via findSimilarClaims, which deliberately
// keeps it to avoid re-embedding on the wire); every other claim read returns
// data to rankers/recall/summaries that never touch the vector. As lore grows,
// an entity accumulates many claims, so `select('*')` here scales egress badly.
const OMEGA_CLAIM_COLS =
  'id, user_id, entity_id, text, source, confidence, sentiment, start_time, end_time, is_active, created_at, updated_at, metadata, temporal_context, temporal_confidence';

// ── Per-content extraction/resolution cache (Phase A: ingestion dedup) ───────
// One chat message fans out into message-level + per-unit ER + perception +
// event-assembly ingestion, each independently calling extractEntities (an LLM
// call) and resolveEntities (up to 500-row omega_entities pool loads per type) —
// frequently on the SAME text/candidates. A short TTL collapses those duplicates
// across the message's synchronous and fire-and-forget tails, cutting both LLM
// spend and Supabase egress. Disabled under test so suites stay deterministic.
const INGEST_CACHE_TTL_MS = 2 * 60 * 1000;
const INGEST_CACHE_MAX = 1000;
const IS_TEST_ENV = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

type CacheBox<T> = { at: number; value: T };

// Exported for unit tests (the service-level caches are bypassed under test).
export const __ingestCacheInternals = { ttlMs: INGEST_CACHE_TTL_MS, maxEntries: INGEST_CACHE_MAX };

export function readCache<T>(cache: Map<string, CacheBox<T>>, key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > INGEST_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

export function writeCache<T>(cache: Map<string, CacheBox<T>>, key: string, value: T): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > INGEST_CACHE_MAX) {
    const expiredBefore = Date.now() - INGEST_CACHE_TTL_MS;
    for (const [k, box] of cache) if (box.at < expiredBefore) cache.delete(k);
    while (cache.size > INGEST_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }
}

const extractEntitiesCache = new Map<string, CacheBox<Array<{ name: string; type: EntityType; bornConfirmed?: boolean }>>>();
const resolveEntitiesCache = new Map<string, CacheBox<Entity[]>>();

export class OmegaMemoryService {
  /**
   * Ingest text and extract entities, claims, and relationships
   */
  async ingestText(userId: string, inputText: string, source: ClaimSource = 'USER'): Promise<IngestionResult> {
    try {
      // Step 1: Extract entities
      const candidateEntities = await this.extractEntities(inputText);
      
      // Step 2: Resolve entities (find existing or create new)
      const resolvedEntities = await this.resolveEntities(userId, candidateEntities);
      
      // Step 3: Extract claims
      const claims = await this.extractClaims(userId, inputText, resolvedEntities, source);

      // O(1) entity lookup by id — avoids O(n) .find() on every claim
      const entityById = new Map(resolvedEntities.map(e => [e.id, e]));

      // Step 4: Queue claims through MRQ — no direct omega_claim writes
      let divergencesDetected = 0;
      const committedClaims: Claim[] = [];

      for (const claim of claims) {
        const existingClaims = await this.findSimilarClaims(userId, claim);

        let conflictingClaims: typeof existingClaims = [];
        if (await this.conflictDetected(claim, existingClaims)) {
          await this.flagNarrativeDivergence(claim, existingClaims);
          divergencesDetected++;
          conflictingClaims = existingClaims;
        }

        const entity = entityById.get(claim.entity_id!);
        if (!entity) {
          logger.warn({ userId, entityId: claim.entity_id }, 'Skipping claim — entity not resolved');
          continue;
        }

        const mrqResult = await queueClaimThroughMrq({
          userId,
          claim,
          entity,
          sourceText: inputText,
        });

        if (!mrqResult.queued) {
          logger.warn(
            { userId, error: mrqResult.error, claimPreview: claim.text?.slice(0, 120) },
            'Claim MRQ queue failed'
          );
          continue;
        }

        if (mrqResult.claim) {
          committedClaims.push(mrqResult.claim);
          await this.handleCommittedClaimSideEffects(
            userId,
            mrqResult.claim,
            inputText,
            entity,
            conflictingClaims
          );
        }
      }
      
      // Step 5: Extract relationships
      const relationships = await this.extractRelationships(userId, inputText, resolvedEntities);
      
      // Step 6: Update entity timestamps
      await this.updateEntityTimestamps(userId, resolvedEntities);
      
      // Step 7: Generate suggestions (but don't auto-apply)
      const suggestions = await this.suggestUpdates(userId, inputText, resolvedEntities, claims, relationships);
      
      // Count claims flagged as conflicting
      const conflictsDetected = claims.filter(claim =>
        claim.confidence < 0.5 || claim.metadata?.flagged === true
      ).length;
      
      return {
        entities: resolvedEntities,
        claims: committedClaims.length > 0 ? committedClaims : claims,
        relationships,
        conflicts_detected: conflictsDetected,
        suggestions,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to ingest text');
      throw error;
    }
  }

  /**
   * Extract entities from text using LLM
   * Made public for mocking in tests
   */
  async extractEntities(text: string): Promise<Array<{ name: string; type: EntityType; bornConfirmed?: boolean }>> {
    // FIX 1: Hard fail in tests - prevent LLM access during unit tests
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      throw new Error(
        'LLM access forbidden during unit tests. Mock extractEntities() in test setup.'
      );
    }

    // Phase A dedup: collapse repeated extraction of identical text. The same
    // message is re-extracted at message level, per semantic unit (ER), per
    // perception unit, and during event assembly — all pure LLM calls on the same
    // content. Memoize by content hash for a short window.
    const cacheKey = createHash('sha256').update(text).digest('hex');
    const cached = readCache(extractEntitiesCache, cacheKey);
    if (cached) return cached;
    const extracted = await this.extractEntitiesUncached(text);
    writeCache(extractEntitiesCache, cacheKey, extracted);
    return extracted;
  }

  private async extractEntitiesUncached(text: string): Promise<Array<{ name: string; type: EntityType; bornConfirmed?: boolean }>> {
    const deterministicCandidates = this.extractDeterministicEntities(text);

    // Pre-LLM gate: skip the extraction call entirely when the text has no
    // entity candidates (no proper noun, glossary entity, or describable
    // person/place cue). This was the last always-on LLM call per ingested
    // message. Fails open — any candidate signal lets the LLM run as before.
    const gate = evaluateEntityCandidates(text);
    if (!gate.hasCandidates) {
      logger.debug({ reason: gate.reason }, 'ingestion.entity_extraction.skipped');
      return uniqueEntities(
        deterministicCandidates.map((e) => ({ name: e.name, type: e.type as EntityType }))
      ).filter((entity) => entity.type !== 'UNKNOWN');
    }

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an entity extraction system for a personal memory and lore journal.

The text is written in FIRST-PERSON. The narrator ("I" / "me" / "my") is the journal author — do NOT extract them as an entity.

Extract all OTHER people, places, organizations, and events. Rules:
- Named people: use their full name if known, first name only if that is all that was mentioned.
- Unnamed people: generate a SHORT DESCRIPTIVE NICKNAME from context, like "the barista at Blue Bottle", "guy from the show who gave free shirt", "Abuela's neighbor with the dog". Keep it under 6 words and specific enough to be recognizable.
- Aliases and nicknames: capture any alternate names mentioned (e.g. "Tío Juan" and "Uncle Juan" → aliases of each other).

Return JSON:
{
  "entities": [
    {
      "name": "entity name or descriptive nickname",
      "type": "PERSON" | "CHARACTER" | "LOCATION" | "ORG" | "EVENT",
      "aliases": ["alternative names or nicknames"],
      "confidence": 0.0-1.0
    }
  ]
}

Only extract entities clearly mentioned. Be conservative with confidence scores. Never include the first-person narrator.
Never extract "LoreBook", "Lore Book", or "Lorekeeper" as entities — those refer to the app itself, not a person or place.`
          },
          {
            role: 'user',
            content: `Extract entities from this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const llmEntities = (response.entities || [])
        .filter((e: any) => e.confidence >= 0.5 && typeof e.name === 'string')
        .map((e: any) => {
          const classification = classifyEntity(e.name, text);
          const deterministicType = toOmegaType(classification.rootType) as EntityType;
          // Deterministic classifier wins when it's confident; otherwise keep the
          // LLM's typed guess (LOCATION/ORG/EVENT/PERSON) rather than defaulting
          // everything to PERSON. Untypable -> UNKNOWN (dropped below).
          return {
            name: e.name,
            type: deterministicType !== 'UNKNOWN' ? deterministicType : llmEntityType(e.type),
          };
        });

      const expanded = expandEntityCandidates(text, [...deterministicCandidates, ...llmEntities]);
      return uniqueEntities(
        expanded.map((e) => ({ name: e.name, type: e.type as EntityType, bornConfirmed: e.bornConfirmed }))
      ).filter((entity) => entity.type !== 'UNKNOWN');
    } catch (error: any) {
      // FIX 3: Never downgrade errors - throw instead of returning empty
      // FIX 4: Rate-limit circuit breaker
      if (error?.status === 429 || error?.code === 'rate_limit_exceeded' || error?.message?.includes('rate limit')) {
        logger.error({ err: error }, 'LLM rate limit exceeded - failing fast');
        throw new Error('LLM rate limit exceeded. Please retry later.');
      }
      
      logger.error({ err: error }, 'Failed to extract entities with LLM - throwing error');
      // Invalid IR is worse than no IR - throw instead of returning empty
      throw error;
    }
  }

  private extractDeterministicEntities(text: string): Array<{ name: string; type: EntityType; bornConfirmed?: boolean }> {
    const candidates = new Set<string>();
    const properNounPattern = /\b([A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+){0,3})\b/g;
    let match: RegExpExecArray | null;
    while ((match = properNounPattern.exec(text)) !== null) {
      candidates.add(match[1].trim());
    }

    // Catch known mixed-case/app phrases that simple proper-noun regexes miss.
    for (const phrase of ['Find My', 'High Noon', 'High Noons', 'Amazon Ring', 'Moreno Valley', 'Club Metro', 'Prayers', 'Ex Lover']) {
      if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
        candidates.add(phrase);
      }
    }

    for (const kin of extractKinshipMentions(text)) {
      candidates.add(kin.sourcePhrase);
    }

    const base = [...candidates]
      .map(name => {
        const classification = classifyEntity(name, text);
        return { name, type: toOmegaType(classification.rootType) as EntityType, confidence: classification.confidence };
      })
      .filter(entity => entity.confidence >= 0.8 && entity.type !== 'UNKNOWN')
      .map(({ name, type }) => ({ name, type }));

    return uniqueEntities(
      expandEntityCandidates(text, base).map((e) => ({
        name: e.name,
        type: e.type as EntityType,
        bornConfirmed: e.bornConfirmed,
      }))
    ).filter((entity) => entity.type !== 'UNKNOWN');
  }

  /**
   * Resolve entities: find existing by name/alias or create new.
   *
   * Batch optimization: pre-load all omega_entities for the user (one query per
   * distinct entity type) then run exact + JW matching in-memory.  Only falls
   * back to a per-entity DB query for the semantic embedding path and for new
   * entity creation, turning O(n×3 DB) → O(types DB + n×in-memory).
   */
  async resolveEntities(
    userId: string,
    candidates: Array<{ name: string; type: EntityType; bornConfirmed?: boolean }>,
    options?: { context?: ResolutionContext }
  ): Promise<Entity[]> {
    if (candidates.length === 0) return [];

    // Phase A dedup: collapse the up-to-500-row omega_entities pool loads when the
    // same candidate set is resolved repeatedly within one message's processing.
    // Bypassed when a custom ResolutionContext is supplied (it can change the
    // outcome) and under test. Side benefit: also dedupes per-message mention
    // bumps so a single mention isn't counted 3–4× across the fan-out paths.
    const canCache = !IS_TEST_ENV && !options?.context;
    if (!canCache) {
      return this.resolveEntitiesUncached(userId, candidates, options);
    }
    const sig =
      userId +
      '|' +
      candidates.map((c) => `${normalizeNameKey(c.name)}:${c.type}`).sort().join(',');
    const cacheKey = createHash('sha256').update(sig).digest('hex');
    const cached = readCache(resolveEntitiesCache, cacheKey);
    if (cached) return cached;
    const resolvedFresh = await this.resolveEntitiesUncached(userId, candidates, options);
    writeCache(resolveEntitiesCache, cacheKey, resolvedFresh);
    return resolvedFresh;
  }

  private async resolveEntitiesUncached(
    userId: string,
    candidates: Array<{ name: string; type: EntityType; bornConfirmed?: boolean }>,
    options?: { context?: ResolutionContext }
  ): Promise<Entity[]> {
    if (candidates.length === 0) return [];

    const context = options?.context ?? {};

    // 1. Gather distinct types
    const distinctTypes = [...new Set(candidates.map(c => c.type))];

    // 2. Batch-load all entities per type in parallel
    const typeEntities = new Map<EntityType, Entity[]>();
    await Promise.all(
      distinctTypes.map(async (type) => {
        const { data } = await supabaseAdmin
          .from('omega_entities')
          .select(OMEGA_ENTITY_COLS)
          .eq('user_id', userId)
          .eq('type', type)
          .limit(500);
        typeEntities.set(type, (data as Entity[]) ?? []);
      })
    );

    // 3. Resolve each candidate — legacy path with optional EntityResolutionCore authority
    const resolved: Entity[] = [];

    for (const candidate of candidates) {
      const pool = typeEntities.get(candidate.type) ?? [];
      const bridged = resolveWithCore({
        mention: candidate.name,
        entityType: candidate.type,
        pool,
        context,
      });

      let match: Entity | null = null;

      if (bridged.useCore) {
        if (bridged.productionDecision === 'skip') {
          continue;
        }
        match = bridged.entityFromCore;
      } else if (bridged.legacy.entity) {
        match = bridged.legacy.entity;
        const reason = bridged.legacy.method === 'jw' ? 'alias_match' : 'exact_match';
        await continuityService.recordEntityResolved(userId, match, reason).catch(() => {});
        this.promoteMentionIfNeeded(userId, match);
        if (bridged.legacy.method === 'jw') {
          this.registerAliasIfNew(userId, match, candidate.name).catch(() => {});
        }
      }

      // Core authoritative resolve — record continuity + alias registration
      if (match && bridged.useCore) {
        await continuityService.recordEntityResolved(userId, match, 'exact_match').catch(() => {});
        this.promoteMentionIfNeeded(userId, match);
        if (normalizeNameKey(match.primary_name) !== normalizeNameKey(candidate.name)) {
          this.registerAliasIfNew(userId, match, candidate.name).catch(() => {});
        }
      }

      // Semantic embedding fallback (single DB call per unresolved candidate)
      if (!match) {
        match = await this.findEntityByNameOrAlias(userId, candidate.name, candidate.type).catch(
          () => null
        );
      }

      // Create if still unresolved
      if (!match) {
        if (bridged.useCore && bridged.productionDecision === 'skip') {
          continue;
        }
        match = await this.createEntity(userId, candidate.name, candidate.type, [], {
          bornConfirmed: candidate.bornConfirmed,
        });
        pool.push(match);
        typeEntities.set(candidate.type, pool);
      }

      resolved.push(match);
    }

    return resolved;
  }

  /**
   * Find entity by name or alias, with semantic similarity fallback
   */
  async findEntityByNameOrAlias(
    userId: string,
    name: string,
    type: EntityType
  ): Promise<Entity | null> {
    // First try exact/alias match
    const { data: exactMatch, error: exactError } = await supabaseAdmin
      .from('omega_entities')
      .select(OMEGA_ENTITY_COLS)
      .eq('user_id', userId)
      .eq('type', type)
      .or(`primary_name.ilike.%${name}%,aliases.cs.{${name}}`)
      .limit(1)
      .single();

    if (exactMatch && !exactError) {
      // Record entity resolution
      await continuityService.recordEntityResolved(userId, exactMatch, 'exact_match');
      return exactMatch;
    }

    // Fuzzy string gate: Jaro-Winkler over all entities of this type before
    // spending tokens on an embedding call. Catches "Sara" → "Sarah",
    // "Jeremy" → "Jerry", initials, etc.
    try {
      const { data: candidatesRaw } = await supabaseAdmin
        .from('omega_entities')
        .select(OMEGA_ENTITY_COLS)
        .eq('user_id', userId)
        .eq('type', type)
        .limit(150);

      const candidates = candidatesRaw as Array<Entity> | null;
      if (candidates && candidates.length > 0) {
        let bestScore = 0;
        let bestCandidate: Entity | null = null;

        for (const candidate of candidates) {
          const namesToCheck: string[] = [
            candidate.primary_name,
            ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
          ].filter(Boolean);

          const score = Math.max(...namesToCheck.map((n: string) => jaroWinkler(
            name.toLowerCase().trim(),
            n.toLowerCase().trim()
          )));

          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }

        if (bestScore >= 0.88 && bestCandidate) {
          logger.debug({ name, matched: bestCandidate.primary_name, score: bestScore }, 'Fuzzy name match resolved entity');
          await continuityService.recordEntityResolved(userId, bestCandidate, 'alias_match');
          return bestCandidate;
        }
      }
    } catch (fuzzyErr) {
      logger.debug({ err: fuzzyErr, name }, 'Fuzzy name match scan failed, continuing to vector search');
    }

    // If no fuzzy match, try semantic similarity search
    try {
      const nameEmbedding = await embeddingService.embedText(name);
      
      // Find similar entities using vector similarity
      const { data: similarEntities } = await supabaseAdmin.rpc(
        'match_omega_entities',
        {
          query_embedding: `[${nameEmbedding.join(',')}]`,
          match_threshold: AI_THRESHOLDS.SEMANTIC_ENTITY_MATCH,
          match_count: 5,
          user_id_param: userId,
          type_param: type,
        }
      );

      if (similarEntities && similarEntities.length > 0) {
        // Record entity resolution via semantic match
        await continuityService.recordEntityResolved(userId, similarEntities[0], 'semantic_match');
        return similarEntities[0];
      }
    } catch (error) {
      logger.info({ err: error, userId, name, type }, 'Semantic search failed, using exact match only');
    }

    return null;
  }

  /**
   * Create new entity with embedding
   */
  async createEntity(
    userId: string,
    name: string,
    type: EntityType,
    aliases: string[] = [],
    options: { bornConfirmed?: boolean } = {}
  ): Promise<Entity> {
    // A new entity is born 'mentioned_only' (a suggestion-queue candidate that
    // chat recall ignores) unless the extracting mention carried positive PERSON
    // evidence — see expandEntityCandidates. Born-confirmed entities are
    // recall-active immediately, so a named person engaged with even once
    // ("Bill texted me") is remembered rather than waiting for a second mention.
    const bornConfirmed = options.bornConfirmed === true;
    // Race condition guard: a concurrent request may have just created this
    // entity. ilike is case- but not accent-insensitive ("Tía" vs "Tia"), so
    // fetch the user's entities of this type and compare normalized keys.
    const nameKey = normalizeNameKey(name);
    const { data: existingRows } = await supabaseAdmin
      .from('omega_entities')
      .select(OMEGA_ENTITY_COLS)
      .eq('user_id', userId)
      .eq('type', type);
    const pool = (existingRows ?? []) as Entity[];
    const existing = pool.find(
      (e: any) =>
        normalizeNameKey(e.primary_name) === nameKey ||
        (Array.isArray(e.aliases) && e.aliases.some((a: string) => normalizeNameKey(a) === nameKey))
    );
    if (existing) {
      if (bornConfirmed) this.confirmIfMentionedOnly(userId, existing);
      return existing;
    }

    // Resolve-before-write gate: even callers that reach createEntity directly
    // (bypassing resolveEntities) must pass through the authority resolver, so a
    // fuzzy/alias/authority match ("Bobby" vs "Bob") returns the canonical entity
    // instead of minting a duplicate. Exact-key miss above already handled.
    const bridged = resolveWithCore({ mention: name, entityType: type, pool, context: {} });
    const resolvedExisting = bridged.useCore
      ? bridged.productionDecision === 'resolve'
        ? bridged.entityFromCore
        : null
      : bridged.legacy.entity;
    if (resolvedExisting) {
      this.registerAliasIfNew(userId, resolvedExisting, name).catch(() => {});
      if (bornConfirmed) this.confirmIfMentionedOnly(userId, resolvedExisting);
      return resolvedExisting;
    }

    // Generate embedding for entity name
    const embedding = await embeddingService.embedText(name);

    const { data, error } = await supabaseAdmin
      .from('omega_entities')
      .insert({
        user_id: userId,
        primary_name: name,
        type,
        aliases,
        embedding: `[${embedding.join(',')}]`,
        mention_count: 1,
        mention_status: bornConfirmed ? 'confirmed' : 'mentioned_only',
      })
      .select(OMEGA_ENTITY_COLS) // don't echo the embedding we just wrote back
      .single();

    if (error) {
      logger.error({ err: error, userId, name, type }, 'Failed to create entity');
      throw error;
    }

    return data;
  }

  /**
   * Extract claims about entities from text using LLM
   */
  private async extractClaims(
    userId: string,
    text: string,
    entities: Entity[],
    source: ClaimSource
  ): Promise<Claim[]> {
    if (entities.length === 0) {
      return [];
    }

    try {
      const entityNames = entities.map(e => e.primary_name).join(', ');
      
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a claim extraction system. Extract factual claims about entities from text.

Return JSON:
{
  "claims": [
    {
      "entity_name": "name of entity",
      "text": "the claim statement",
      "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED",
      "confidence": 0.0-1.0,
      "temporal_context": {
        "start_time": "ISO timestamp or null",
        "end_time": "ISO timestamp or null",
        "is_ongoing": boolean
      }
    }
  ]
}

Only extract clear factual claims. Include temporal context when available.`
          },
          {
            role: 'user',
            content: `Extract claims about these entities: ${entityNames}\n\nFrom this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extractedClaims = response.claims || [];

      const claims: Claim[] = [];
      const now = new Date().toISOString();

      for (const extracted of extractedClaims) {
        // Find matching entity
        const entity = entities.find(e => 
          e.primary_name === extracted.entity_name || 
          e.aliases.includes(extracted.entity_name)
        );

        if (!entity || extracted.confidence < 0.5) continue;

        // Generate embedding for semantic similarity
        const embedding = await embeddingService.embedText(extracted.text);

        const temporalContext = extracted.temporal_context || {};
        const startTime = temporalContext.start_time || now;
        const endTime = temporalContext.end_time || null;

        claims.push({
          id: '', // Will be set by storeClaim
          user_id: userId,
          entity_id: entity.id,
          text: extracted.text,
          source,
          confidence: extracted.confidence || 0.6,
          sentiment: extracted.sentiment,
          start_time: startTime,
          end_time: endTime,
          is_active: true,
          created_at: now,
          updated_at: now,
          metadata: {
            temporal_context: temporalContext,
            temporal_confidence: temporalContext.temporal_confidence || 0.8,
          },
        } as Claim & { embedding?: number[] });

        // Store embedding separately (will be added to claim in storeClaim)
        (claims[claims.length - 1] as any).embedding = embedding;
      }

      return claims;
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract claims with LLM');
      // Fallback to simple claims
      return entities.map(entity => ({
        id: '',
        user_id: userId,
        entity_id: entity.id,
        text: `Mentioned: ${entity.primary_name}`,
        source,
        confidence: 0.5,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Claim));
    }
  }

  /**
   * Extract relationships between entities using LLM
   */
  private async extractRelationships(
    userId: string,
    text: string,
    entities: Entity[]
  ): Promise<Relationship[]> {
    if (entities.length < 2) {
      return [];
    }

    try {
      const entityNames = entities.map(e => e.primary_name).join(', ');
      
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a relationship extraction system. Extract relationships between entities from text.

Return JSON:
{
  "relationships": [
    {
      "from_entity": "entity name",
      "to_entity": "entity name",
      "type": "relationship type (e.g., 'coach_of', 'friend_of', 'located_at', 'works_at')",
      "confidence": 0.0-1.0,
      "start_time": "ISO timestamp or null",
      "end_time": "ISO timestamp or null"
    }
  ]
}

Only extract clear relationships. Include temporal context when available.`
          },
          {
            role: 'user',
            content: `Extract relationships between these entities: ${entityNames}\n\nFrom this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extracted = response.relationships || [];

      const relationships: Relationship[] = [];
      const now = new Date().toISOString();

      for (const rel of extracted) {
        if (rel.confidence < 0.5) continue;

        const fromEntity = entities.find(e => 
          e.primary_name === rel.from_entity || e.aliases.includes(rel.from_entity)
        );
        const toEntity = entities.find(e => 
          e.primary_name === rel.to_entity || e.aliases.includes(rel.to_entity)
        );

        if (!fromEntity || !toEntity) continue;

        relationships.push({
          id: '',
          user_id: userId,
          from_entity_id: fromEntity.id,
          to_entity_id: toEntity.id,
          type: rel.type,
          confidence: rel.confidence || 0.6,
          start_time: rel.start_time || now,
          end_time: rel.end_time || null,
          is_active: true,
          created_at: now,
          updated_at: now,
        } as Relationship);
      }

      return relationships;
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract relationships with LLM');
      return [];
    }
  }

  /**
   * Find similar claims for conflict detection
   */
  async findSimilarClaims(userId: string, claim: Claim): Promise<Claim[]> {
    // NOTE: this is the ONE claim read that intentionally keeps `select('*')` —
    // conflictDetected() reuses the stored embedding to avoid a per-claim OpenAI
    // re-embed (cost + latency + 429 risk). Egress here is a deliberate trade.
    let query = supabaseAdmin
      .from('omega_claims')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', claim.entity_id)
      .eq('is_active', true);

    if (claim.id) {
      query = query.neq('id', claim.id);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, claimId: claim.id }, 'Failed to find similar claims');
      return [];
    }

    return data || [];
  }

  /**
   * Detect if new claim conflicts with existing claims using semantic similarity
   */
  async conflictDetected(newClaim: Claim, existingClaims: Claim[]): Promise<boolean> {
    if (existingClaims.length === 0) return false;

    try {
      // Get embedding for new claim
      const newEmbedding = await embeddingService.embedText(newClaim.text);

      // Check temporal overlap and semantic similarity
      for (const oldClaim of existingClaims) {
        // Check temporal overlap first (only conflicts matter if they overlap in time)
        const hasOverlap = this.temporalOverlap(
          new Date(newClaim.start_time),
          newClaim.end_time ? new Date(newClaim.end_time) : null,
          new Date(oldClaim.start_time),
          oldClaim.end_time ? new Date(oldClaim.end_time) : null
        );
        
        if (hasOverlap) {
          // Get old claim embedding if not cached
          let oldEmbedding: number[];
          if ((oldClaim as any).embedding) {
            oldEmbedding = (oldClaim as any).embedding;
          } else {
            oldEmbedding = await embeddingService.embedText(oldClaim.text);
            // Cache it
            (oldClaim as any).embedding = oldEmbedding;
          }

          // Calculate cosine similarity
          const similarity = this.cosineSimilarity(newEmbedding, oldEmbedding);
          
          // Low similarity + temporal overlap might indicate contradiction
          // Use LLM to verify if it's actually a contradiction
          if (similarity < 0.3) {
            const isContradiction = await this.llmDetectContradiction(newClaim.text, oldClaim.text);
            if (isContradiction) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect conflict with semantic similarity');
      // Fallback to simple text check
      const fallbackResult = this.semanticOpposite(newClaim.text, existingClaims[0]?.text || '');
      return fallbackResult;
    }
  }

  /**
   * Fire-and-forget: increment mention_count and promote 'mentioned_only' →
   * 'confirmed' once the entity has been seen ENTITY_CONFIRMATION_THRESHOLD times.
   */
  private async registerAliasIfNew(userId: string, entity: Entity, name: string): Promise<void> {
    const existing = Array.isArray(entity.aliases) ? entity.aliases as string[] : [];
    const nameLower = name.toLowerCase();
    if (entity.primary_name.toLowerCase() === nameLower) return;
    if (existing.some((a) => a.toLowerCase() === nameLower)) return;

    // Over-merge guard. This path runs whenever a mention RESOLVES to an existing
    // entity, appending the mention's name as an alias. A loose/substring resolve
    // of a DISTINCT person (e.g. "Abuela" mis-resolving onto "Hell Fairy") would
    // otherwise permanently pollute the alias list, and the alias-contains match
    // then snowballs more names in — this is exactly how ~14 unrelated people
    // collapsed into one "Hell Fairy" entity. Refuse to auto-register a name that
    // is wholly dissimilar to every known name for the entity; a genuinely
    // dissimilar alias (a stage name) must come from an explicit "X aka Y"
    // statement (createEntity's direct alias insert), not silent accumulation.
    const knownNames = [entity.primary_name, ...existing].filter(Boolean) as string[];
    if (!isPlausibleAutoAlias(knownNames, name)) {
      logger.warn(
        { entityId: entity.id, primaryName: entity.primary_name, rejectedAlias: name },
        'Rejected dissimilar alias to prevent entity over-merge',
      );
      return;
    }

    try {
      await supabaseAdmin
        .from('omega_entities')
        .update({ aliases: [...existing, name] })
        .eq('id', entity.id)
        .eq('user_id', userId);
    } catch (err) {
      logger.warn({ err, entityId: entity.id, alias: name }, 'alias registration failed (non-fatal)');
    }
  }

  /**
   * Fire-and-forget: flip an existing 'mentioned_only' entity to 'confirmed'
   * when a later mention arrives carrying positive PERSON evidence (born-confirmed
   * signal). This rescues people first seen as a bare name-drop (suggestion-queue
   * only) the moment the conversation actually engages with them.
   */
  private confirmIfMentionedOnly(userId: string, entity: Entity): void {
    const e = entity as Entity & { mention_status?: string };
    if (e.mention_status !== 'mentioned_only') return;
    e.mention_status = 'confirmed';
    Promise.resolve(
      supabaseAdmin
        .from('omega_entities')
        .update({ mention_status: 'confirmed' })
        .eq('id', entity.id)
        .eq('user_id', userId)
    ).catch((err: unknown) =>
      logger.warn({ err, entityId: entity.id }, 'born-confirmed promotion failed (non-fatal)')
    );
  }

  private promoteMentionIfNeeded(userId: string, entity: Entity): void {
    const e = entity as Entity & { mention_status?: string; mention_count?: number };
    // Count EVERY re-mention — previously this early-returned for confirmed
    // entities, freezing mention_count at the confirmation threshold and
    // making character importance permanently stuck at its initial level.
    const newCount = (e.mention_count ?? 1) + 1;
    const newStatus = e.mention_status === 'mentioned_only' && newCount >= AI_THRESHOLDS.ENTITY_CONFIRMATION_THRESHOLD
      ? 'confirmed'
      : e.mention_status ?? 'mentioned_only';
    Promise.resolve(
      supabaseAdmin
        .from('omega_entities')
        .update({ mention_count: newCount, mention_status: newStatus })
        .eq('id', entity.id)
        .eq('user_id', userId)
    ).catch((err: unknown) => logger.warn({ err, entityId: entity.id }, 'mention promotion failed (non-fatal)'));

    // Keep the promoted character's importance in step with how often the
    // person actually comes up: 1–2 minor, 3–5 supporting, 6+ major.
    this.syncCharacterImportance(userId, entity.id, newCount).catch((err: unknown) =>
      logger.debug({ err, entityId: entity.id }, 'character importance sync failed (non-fatal)')
    );
  }

  private async syncCharacterImportance(
    userId: string,
    omegaEntityId: string,
    mentionCount: number
  ): Promise<void> {
    const mentionBasedLevel = mentionCount >= 6 ? 'major' : mentionCount >= 3 ? 'supporting' : 'minor';
    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, importance_level, metadata')
      .eq('user_id', userId)
      .eq('metadata->>omega_entity_id', omegaEntityId)
      .limit(1);
    const character = rows?.[0] as { id: string; importance_level: string | null; metadata: Record<string, unknown> | null } | undefined;
    if (!character) return;

    // Only auto-raise, never lower — and never touch protagonist (manual)
    const rank: Record<string, number> = { background: 0, minor: 1, supporting: 2, major: 3, protagonist: 4 };
    const categories = Array.isArray(character.metadata?.relationship_categories)
      ? character.metadata.relationship_categories as string[]
      : [];
    const categoryBasedLevel = categories.some(category => ['family', 'romantic', 'mentor'].includes(String(category).toLowerCase()))
      ? 'supporting'
      : mentionBasedLevel;
    const importanceLevel = rank[categoryBasedLevel] > rank[mentionBasedLevel] ? categoryBasedLevel : mentionBasedLevel;
    const current = rank[character.importance_level ?? 'minor'] ?? 1;
    const proposed = rank[importanceLevel];
    const metadata = { ...(character.metadata ?? {}), mention_count: mentionCount };

    await supabaseAdmin
      .from('characters')
      .update(
        proposed > current
          ? { importance_level: importanceLevel, metadata, updated_at: new Date().toISOString() }
          : { metadata, updated_at: new Date().toISOString() }
      )
      .eq('id', character.id)
      .eq('user_id', userId);
  }

  /**
   * Check temporal overlap between two time ranges
   */
  private temporalOverlap(
    start1: Date,
    end1: Date | null,
    start2: Date,
    end2: Date | null
  ): boolean {
    // If either is ongoing (no end), check if they overlap
    if (!end1) {
      return start2 <= start1 || (end2 !== null && end2 >= start1);
    }
    if (!end2) {
      return start1 <= start2 || end1 >= start2;
    }
    
    // Both have end times - check for overlap
    return start1 <= end2 && end1 >= start2;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Use LLM to detect if two claims are contradictory
   */
  private async llmDetectContradiction(text1: string, text2: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a contradiction detection system. Determine if two claims contradict each other.

Return JSON:
{
  "is_contradiction": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

A contradiction means the claims cannot both be true at the same time.`
          },
          {
            role: 'user',
            content: `Claim 1: ${text1}\n\nClaim 2: ${text2}\n\nAre these contradictory?`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const result = response.is_contradiction === true && (response.confidence || 0) >= 0.7;
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect contradiction with LLM');
      return false;
    }
  }

  /**
   * Check if two texts are semantically opposite (fallback)
   */
  private semanticOpposite(text1: string, text2: string): boolean {
    const opposites = [
      ['is', 'is not'],
      ['was', 'was not'],
      ['has', 'does not have'],
      ['likes', 'dislikes'],
      ['loves', 'hates'],
    ];

    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    for (const [pos, neg] of opposites) {
      if ((lower1.includes(pos) && lower2.includes(neg)) ||
          (lower1.includes(neg) && lower2.includes(pos))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Flag narrative divergence (non-destructive)
   * Keeps all claims active - entries are never retroactively invalidated
   */
  async flagNarrativeDivergence(newClaim: Claim, existingClaims: Claim[]): Promise<void> {
    try {
      // Update metadata to flag divergence, but keep claims active
      for (const claim of existingClaims) {
        await supabaseAdmin
          .from('omega_claims')
          .update({
            metadata: {
              ...(claim.metadata || {}),
              narrative_divergence: true,
              diverged_with: newClaim.id,
              diverged_at: new Date().toISOString(),
            },
          })
          .eq('id', claim.id);
      }
      
      // Also flag the new claim (if it has an id)
      if (newClaim.id) {
        await supabaseAdmin
          .from('omega_claims')
          .update({
            metadata: {
              ...(newClaim.metadata || {}),
              narrative_divergence: true,
              diverged_with: existingClaims.map(c => c.id),
              diverged_at: new Date().toISOString(),
            },
          })
          .eq('id', newClaim.id);
      }
      
      logger.info(
        { newClaimId: newClaim.id, existingCount: existingClaims.length },
        'Flagged narrative divergence (non-destructive)'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to flag narrative divergence');
    }
  }

  /**
   * Mark claims as inactive when conflicts detected
   * @deprecated Use flagNarrativeDivergence instead - entries are never retroactively invalidated
   */
  async markClaimsInactive(claims: Claim[]): Promise<void> {
    const now = new Date().toISOString();
    
    for (const claim of claims) {
      const { error } = await supabaseAdmin
        .from('omega_claims')
        .update({
          is_active: false,
          end_time: now,
          updated_at: now,
        })
        .eq('id', claim.id);

      if (error) {
        logger.error({ err: error, claimId: claim.id }, 'Failed to mark claim inactive');
      }
    }
  }

  /**
   * Lower confidence of claims
   */
  async lowerConfidence(claims: Claim[]): Promise<void> {
    for (const claim of claims) {
      // Bayesian update: add a contradiction observation rather than flat subtraction.
      // This preserves how much prior evidence we had — a well-supported claim that
      // receives one contradiction stays more stable than a weak claim.
      const existing = deserializeBelief((claim as any).metadata ?? null)
        || fromFloat(claim.confidence ?? 0.6);
      const updated = updateBelief(existing, 0, 1.0); // one full contradiction
      const { mean: newConfidence } = beliefStats(updated);

      const { error } = await supabaseAdmin
        .from('omega_claims')
        .update({
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
          metadata: {
            ...((claim as any).metadata ?? {}),
            belief: serializeBelief(updated),
          },
        })
        .eq('id', claim.id);

      if (error) {
        logger.error({ err: error, claimId: claim.id }, 'Failed to lower confidence');
      }
    }
  }

  /**
   * Side effects after MRQ commits a claim (auto-approve or manual approve).
   */
  private async handleCommittedClaimSideEffects(
    userId: string,
    storedClaim: Claim,
    inputText: string,
    entity: Entity,
    conflictingClaims: Claim[]
  ): Promise<void> {
    if (conflictingClaims.length > 0 && storedClaim.id) {
      continuityService.recordContradiction(userId, storedClaim, conflictingClaims[0])
        .catch((err) => logger.warn({ err }, 'Contradiction continuity event failed (non-fatal)'));

      correctionTracker.recordCorrection(userId, {
        correction_type: 'entity',
        original_value: (conflictingClaims[0].text ?? '').substring(0, 500),
        corrected_value: (storedClaim.text ?? '').substring(0, 500),
        context: `Contradiction detected for entity ${storedClaim.entity_id}`,
        metadata: {
          entity_id: storedClaim.entity_id,
          claim_id: storedClaim.id,
          conflicting_claim_id: conflictingClaims[0].id,
          source: 'contradiction_detection',
        },
      }).catch((err: unknown) => logger.warn({ err }, 'correction tracker record failed (non-fatal)'));

      Promise.all(
        conflictingClaims
          .filter((c) => c.id)
          .map((conflicting) =>
            provenanceEdgeService.createEdge({
              userId,
              sourceId: storedClaim.id,
              sourceType: 'omega_claim',
              targetId: conflicting.id!,
              targetType: 'omega_claim',
              relation: 'CONTRADICTS',
              confidence: storedClaim.confidence ?? 0.7,
              toTruthState: 'DISPUTED',
              meta: {
                newText: (storedClaim.text ?? '').substring(0, 200),
                conflictingText: (conflicting.text ?? '').substring(0, 200),
                entityId: storedClaim.entity_id,
                detectedAt: new Date().toISOString(),
              },
            })
          )
      ).catch((err) => logger.warn({ err }, 'CONTRADICTS edge writes failed (non-fatal)'));
    }

    await continuityService.recordClaimCreation(userId, storedClaim, inputText, entity);
  }

  /**
   * Persist a claim to omega_claims. Intended for MRQ commit paths only.
   */
  async storeClaim(claim: Partial<Claim> & { embedding?: number[] }): Promise<Claim> {
    // Resolve-before-write gate (claim side): a claim is meaningless without a
    // canonical entity to attach to. This is the single DB chokepoint for claim
    // inserts, so verify the referenced omega_entities row still exists for this
    // user before writing — fail closed. Without this, a stale entity_id (entity
    // merged/deleted between proposal creation and commit, or a future caller
    // passing an unresolved id) silently mints an ORPHAN claim that points at no
    // real identity. See [[project_identity_architecture]] step 2.
    if (!claim.user_id || !claim.entity_id) {
      throw new Error('storeClaim: user_id and entity_id are required (resolve-before-write gate)');
    }
    const { data: canonicalEntity, error: entityLookupError } = await supabaseAdmin
      .from('omega_entities')
      .select('id')
      .eq('id', claim.entity_id)
      .eq('user_id', claim.user_id)
      .maybeSingle();
    if (entityLookupError) {
      logger.error(
        { err: entityLookupError, userId: claim.user_id, entityId: claim.entity_id },
        'storeClaim: entity existence check failed'
      );
      throw entityLookupError;
    }
    if (!canonicalEntity) {
      logger.warn(
        { userId: claim.user_id, entityId: claim.entity_id },
        'storeClaim: refusing orphan claim — no canonical entity for entity_id'
      );
      throw new Error(
        `storeClaim: no canonical entity ${claim.entity_id} for user ${claim.user_id} (resolve-before-write gate)`
      );
    }

    // Initialise Beta belief from source type and the AI-derived confidence float.
    // This replaces raw float storage with a distributional model that accumulates
    // evidence over time rather than being overwritten on each update.
    const prior = claim.source === 'USER' ? PRIORS.userStated
                : claim.source === 'AI'   ? PRIORS.aiInferred
                : PRIORS.uniform;
    const rawConf = claim.confidence ?? 0.6;
    // Blend prior with the AI-estimated confidence: one "observation" at rawConf strength
    const initialBelief = updateBelief(prior, rawConf, 1.0 - rawConf);
    const { mean: derivedConfidence } = beliefStats(initialBelief);

    const claimData: any = {
      user_id: claim.user_id!,
      entity_id: claim.entity_id!,
      text: claim.text!,
      source: claim.source!,
      confidence: derivedConfidence,
      sentiment: claim.sentiment,
      start_time: claim.start_time || new Date().toISOString(),
      end_time: claim.end_time,
      is_active: claim.is_active ?? true,
      metadata: {
        ...(claim.metadata ?? {}),
        belief: serializeBelief(initialBelief),
      },
    };

    // Add embedding if provided
    if (claim.embedding) {
      claimData.embedding = `[${claim.embedding.join(',')}]`;
    }

    // Add temporal context from metadata
    if (claim.metadata?.temporal_context) {
      claimData.temporal_context = claim.metadata.temporal_context;
      claimData.temporal_confidence = claim.metadata.temporal_confidence || 0.8;
    }

    const { data, error } = await supabaseAdmin
      .from('omega_claims')
      .insert(claimData)
      .select(OMEGA_CLAIM_COLS) // don't echo the embedding we just wrote back
      .single();

    if (error) {
      logger.error({ err: error }, 'Failed to store claim');
      throw error;
    }

    return data;
  }

  /**
   * Update entity timestamps
   */
  async updateEntityTimestamps(userId: string, entities: Entity[]): Promise<void> {
    const now = new Date().toISOString();
    
    for (const entity of entities) {
      const { error } = await supabaseAdmin
        .from('omega_entities')
        .update({ updated_at: now })
        .eq('id', entity.id)
        .eq('user_id', userId);

      if (error) {
        logger.error({ err: error, entityId: entity.id }, 'Failed to update entity timestamp');
      }
    }
  }

  /**
   * Merge two entities (with continuity tracking)
   */
  async mergeEntities(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<{ success: boolean; event_id?: string }> {
    try {
      // Get entities
      const { data: sourceEntity } = await supabaseAdmin
        .from('omega_entities')
        .select(OMEGA_ENTITY_COLS)
        .eq('id', sourceEntityId)
        .eq('user_id', userId)
        .single();

      const { data: targetEntity } = await supabaseAdmin
        .from('omega_entities')
        .select(OMEGA_ENTITY_COLS)
        .eq('id', targetEntityId)
        .eq('user_id', userId)
        .single();

      if (!sourceEntity || !targetEntity) {
        throw new Error('Entities not found');
      }

      // Get claims for source entity
      const { data: sourceClaims } = await supabaseAdmin
        .from('omega_claims')
        .select('id')
        .eq('entity_id', sourceEntityId)
        .eq('user_id', userId);

      const mergedClaimIds = sourceClaims?.map(c => c.id) || [];

      // Update claims to point to target entity
      if (mergedClaimIds.length > 0) {
        await supabaseAdmin
          .from('omega_claims')
          .update({ entity_id: targetEntityId })
          .in('id', mergedClaimIds);
      }

      // Redirect authority-map links from source omega entity to target (canonical character graph).
      const { data: sourceAuthRows } = await supabaseAdmin
        .from('character_authority_map')
        .select('canonical_character_id, alias_name, match_method, confidence')
        .eq('user_id', userId)
        .eq('source_table', 'omega_entities')
        .eq('source_id', sourceEntityId);

      for (const row of sourceAuthRows ?? []) {
        await characterAuthorityService.linkSourceRecord(
          userId,
          row.canonical_character_id,
          'omega_entities',
          targetEntityId,
          row.alias_name ?? sourceEntity.primary_name,
          row.match_method ?? 'omega_merge',
          Number(row.confidence ?? 1),
        );
      }
      if ((sourceAuthRows?.length ?? 0) > 0) {
        await supabaseAdmin
          .from('character_authority_map')
          .delete()
          .eq('user_id', userId)
          .eq('source_table', 'omega_entities')
          .eq('source_id', sourceEntityId);
      }

      // Backpropagate source identity into target aliases so the merged
      // name is still resolvable going forward.
      const existingAliases: string[] = Array.isArray(targetEntity.aliases) ? targetEntity.aliases : [];
      const incomingNames  = [
        sourceEntity.primary_name,
        ...(Array.isArray(sourceEntity.aliases) ? sourceEntity.aliases : []),
      ].filter(Boolean) as string[];
      const mergedAliases = Array.from(new Set([...existingAliases, ...incomingNames]));
      if (mergedAliases.length !== existingAliases.length) {
        await supabaseAdmin
          .from('omega_entities')
          .update({ aliases: mergedAliases, updated_at: new Date().toISOString() })
          .eq('id', targetEntityId)
          .eq('user_id', userId);
      }

      // Delete source entity
      await supabaseAdmin
        .from('omega_entities')
        .delete()
        .eq('id', sourceEntityId)
        .eq('user_id', userId);

      // Record merge event
      const event = await continuityService.recordEntityMerge(userId, {
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        merged_claim_ids: mergedClaimIds,
        source_entity: sourceEntity,
        target_entity: targetEntity,
      });

      return { success: true, event_id: event.id };
    } catch (error) {
      logger.error({ err: error, userId, sourceEntityId, targetEntityId }, 'Failed to merge entities');
      throw error;
    }
  }

  /**
   * Rank claims by truth score (recency + confidence + evidence + temporal confidence)
   */
  async rankClaims(userId: string, entityId: string): Promise<RankedClaim[]> {
    await assertOmegaEntityOwned(userId, entityId);

    const { data: claims, error } = await supabaseAdmin
      .from('omega_claims')
      .select(OMEGA_CLAIM_COLS)
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('start_time', { ascending: false });

    if (error) {
      logger.error({ err: error, entityId }, 'Failed to fetch claims for ranking');
      throw error;
    }

    // Get evidence-weighted scores for each claim
    const claimsWithEvidence = await Promise.all(
      (claims || []).map(async (claim) => {
        // Get evidence with reliability scores
        const { data: evidence } = await supabaseAdmin
          .from('omega_evidence')
          .select('reliability_score, source_type')
          .eq('claim_id', claim.id);

        // Calculate evidence-weighted score
        const evidenceCount = evidence?.length || 0;
        const evidenceWeightedScore = evidence && evidence.length > 0
          ? evidence.reduce((sum: number, e: any) => sum + (e.reliability_score || 1.0), 0) / evidence.length
          : 0.5;

        // Get temporal confidence from metadata or default
        const temporalConfidence = (claim as any).temporal_confidence || 
                                   (claim.metadata as any)?.temporal_confidence || 
                                   0.8;

        return {
          ...claim,
          evidence_count: evidenceCount,
          evidence_weighted_score: evidenceWeightedScore,
          temporal_confidence: temporalConfidence,
        };
      })
    );

    // Calculate scores with enhanced weighting
    const now = Date.now();
    const ranked = claimsWithEvidence.map((claim) => {
      const recencyWeight = this.timeDecay(new Date(claim.start_time).getTime(), now);
      const confidenceWeight = claim.confidence;
      const evidenceWeight = Math.min(claim.evidence_count / 10, 1.0); // Cap at 1.0
      const evidenceReliabilityWeight = claim.evidence_weighted_score || 0.5;
      const temporalWeight = claim.temporal_confidence || 0.8;

      // Enhanced scoring: recency (30%) + confidence (25%) + evidence count (15%) + evidence reliability (15%) + temporal (15%)
      const score = 
        recencyWeight * 0.30 +
        confidenceWeight * 0.25 +
        evidenceWeight * 0.15 +
        evidenceReliabilityWeight * 0.15 +
        temporalWeight * 0.15;

      return {
        ...claim,
        score,
        evidence_count: claim.evidence_count,
      } as RankedClaim;
    });

    // Sort by score descending
    return ranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Time decay function (exponential decay)
   */
  private timeDecay(timestamp: number, now: number): number {
    const daysSince = (now - timestamp) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 365); // Half-life of 1 year
  }

  /**
   * Summarize entity with ranked claims using LLM
   */
  async summarizeEntity(userId: string, entityId: string): Promise<EntitySummary> {
    await assertOmegaEntityOwned(userId, entityId);

    const { data: entity, error: entityError } = await supabaseAdmin
      .from('omega_entities')
      .select(OMEGA_ENTITY_COLS)
      .eq('id', entityId)
      .eq('user_id', userId)
      .single();

    if (entityError || !entity) {
      throw new TenantAccessError('Entity not found');
    }

    const rankedClaims = await this.rankClaims(userId, entityId);

    const resolved = await characterAuthorityService.resolveByOmegaEntity(userId, entityId);
    let relationships: Relationship[] = [];
    if (resolved.characterId) {
      const { data: charRels } = await supabaseAdmin
        .from('character_relationships')
        .select('id, user_id, source_character_id, target_character_id, relationship_type, confidence, created_at, updated_at, summary')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${resolved.characterId},target_character_id.eq.${resolved.characterId}`);

      relationships = (charRels ?? []).map((rel: Record<string, unknown>) => ({
        id: String(rel.id),
        user_id: String(rel.user_id),
        from_entity_id: rel.source_character_id === resolved.characterId ? entityId : String(rel.source_character_id),
        to_entity_id: rel.target_character_id === resolved.characterId ? entityId : String(rel.target_character_id),
        type: String(rel.relationship_type ?? 'related_to'),
        confidence: Number(rel.confidence ?? 0.8),
        start_time: String(rel.created_at ?? new Date().toISOString()),
        end_time: null,
        is_active: true,
        created_at: String(rel.created_at ?? new Date().toISOString()),
        updated_at: String(rel.updated_at ?? rel.created_at ?? new Date().toISOString()),
        metadata: rel.summary ? { summary: rel.summary } : undefined,
      }));
    }

    // Use LLM to generate comprehensive summary
    try {
      const topClaims = rankedClaims.slice(0, 10).map(c => ({
        text: c.text,
        confidence: c.confidence,
        score: c.score,
        start_time: c.start_time,
        end_time: c.end_time,
        evidence_count: c.evidence_count,
      }));

      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a narrative summarization system. Create a comprehensive summary of an entity based on ranked claims.

Consider:
- Temporal evolution (how the entity changed over time)
- Confidence levels and evidence
- Uncertainty when claims conflict or have low confidence
- Most reliable and recent information

Write a natural, narrative summary that captures the entity's story while noting any uncertainty or contradictions.`
          },
          {
            role: 'user',
            content: `Entity: ${entity.primary_name} (${entity.type})
            
Top Claims (ranked by truth score):
${JSON.stringify(topClaims, null, 2)}

Active Relationships: ${relationships?.length || 0}

Generate a comprehensive summary that:
1. Describes the entity's evolution over time
2. Highlights the most reliable information
3. Notes any uncertainty or contradictions
4. Incorporates temporal context`
          }
        ]
      });

      const summary = completion.choices[0]?.message?.content || 
        `Entity ${entity.primary_name} has ${rankedClaims.length} active claims.`;

      // Detect uncertainty notes
      const uncertaintyNotes: string[] = [];
      const lowConfidenceClaims = rankedClaims.filter(c => c.confidence < 0.6);
      if (lowConfidenceClaims.length > 0) {
        uncertaintyNotes.push(`${lowConfidenceClaims.length} claims have low confidence`);
      }

      const conflictingClaims = rankedClaims.filter(c => c.evidence_count === 0 && c.confidence < 0.7);
      if (conflictingClaims.length > 0) {
        uncertaintyNotes.push(`${conflictingClaims.length} claims lack supporting evidence`);
      }

      return {
        entity,
        summary,
        ranked_claims: rankedClaims,
        active_relationships: relationships || [],
        uncertainty_notes: uncertaintyNotes.length > 0 ? uncertaintyNotes : undefined,
      };
    } catch (error) {
      logger.error({ err: error, entityId }, 'Failed to generate LLM summary');
      // Fallback to simple summary
      const summary = `Entity ${entity.primary_name} has ${rankedClaims.length} active claims. ` +
        `Most recent: ${rankedClaims[0]?.text || 'None'}`;
      
      return {
        entity,
        summary,
        ranked_claims: rankedClaims,
        active_relationships: relationships || [],
      };
    }
  }

  /**
   * Suggest updates (AI analyzes, human approves) using LLM
   */
  async suggestUpdates(
    _userId: string,
    inputText: string,
    entities: Entity[],
    claims: Claim[],
    relationships: Relationship[]
  ): Promise<UpdateSuggestion[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an update suggestion system. Analyze text and propose updates to the knowledge base.

Return JSON:
{
  "suggestions": [
    {
      "type": "new_claim" | "end_claim" | "relationship_change" | "entity_update",
      "entity_id": "entity ID if applicable",
      "claim_id": "claim ID if applicable",
      "relationship_id": "relationship ID if applicable",
      "description": "human-readable description of the suggestion",
      "confidence": 0.0-1.0,
      "proposed_data": { ... } // Relevant data for the update
    }
  ]
}

Only suggest high-confidence updates. Be conservative.`
          },
          {
            role: 'user',
            content: `Analyze this text and suggest updates:

Text: ${inputText.slice(0, 2000)}

Existing Entities: ${entities.map(e => e.primary_name).join(', ')}
New Claims: ${claims.length}
New Relationships: ${relationships.length}

Propose updates that should be reviewed before applying.`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return (response.suggestions || []).filter((s: any) => s.confidence >= 0.7);
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate update suggestions');
      return [];
    }
  }

  /**
   * Approve and apply an update suggestion
   */
  async approveUpdate(userId: string, suggestion: UpdateSuggestion): Promise<void> {
    switch (suggestion.type) {
      case 'new_claim':
        if (suggestion.proposed_data && suggestion.entity_id) {
          const { data: entity, error } = await supabaseAdmin
            .from('omega_entities')
            .select(OMEGA_ENTITY_COLS)
            .eq('id', suggestion.entity_id)
            .eq('user_id', userId)
            .maybeSingle();

          if (error || !entity) {
            logger.warn({ err: error, userId, entityId: suggestion.entity_id }, 'approveUpdate: entity not found');
            break;
          }

          const claimPayload = {
            ...(suggestion.proposed_data as Partial<Claim>),
            user_id: userId,
            entity_id: suggestion.entity_id,
          };

          const result = await queueClaimThroughMrq({
            userId,
            claim: claimPayload,
            entity: entity as Entity,
            sourceText: claimPayload.text ?? 'Approved update suggestion',
          });

          if (!result.queued) {
            throw new Error(result.error ?? 'Failed to queue approved claim through MRQ');
          }
        }
        break;
      case 'end_claim':
        if (suggestion.claim_id) {
          const { data: claim } = await supabaseAdmin
            .from('omega_claims')
            .select(OMEGA_CLAIM_COLS)
            .eq('id', suggestion.claim_id)
            .eq('user_id', userId)
            .single();
          
          if (claim) {
            const now = new Date().toISOString();
            await supabaseAdmin
              .from('omega_claims')
              .update({ is_active: false, end_time: now, updated_at: now })
              .eq('id', suggestion.claim_id);
          }
        }
        break;
      case 'relationship_change':
        // TODO: Implement relationship updates
        break;
      case 'entity_update':
        if (suggestion.entity_id && suggestion.proposed_data) {
          await supabaseAdmin
            .from('omega_entities')
            .update(suggestion.proposed_data)
            .eq('id', suggestion.entity_id)
            .eq('user_id', userId);
        }
        break;
    }
  }

  /**
   * Add evidence to a claim with reliability scoring
   */
  async addEvidence(
    userId: string, 
    claimId: string, 
    content: string, 
    source: string,
    sourceType: 'journal_entry' | 'chat' | 'external' | 'user_verified' | 'ai_inferred' = 'journal_entry'
  ): Promise<Evidence> {
    // Calculate reliability score based on source type
    const reliabilityScores: Record<string, number> = {
      'user_verified': 1.0,
      'journal_entry': 0.9,
      'chat': 0.7,
      'external': 0.5,
      'ai_inferred': 0.6,
    };

    const reliabilityScore = reliabilityScores[sourceType] || 0.5;

    const { data, error } = await supabaseAdmin
      .from('omega_evidence')
      .insert({
        user_id: userId,
        claim_id: claimId,
        content,
        source,
        source_type: sourceType,
        reliability_score: reliabilityScore,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, claimId }, 'Failed to add evidence');
      throw error;
    }

    return data;
  }

  /**
   * Get all entities for a user.
   * By default returns only confirmed/canonical entities (mention_status != 'mentioned_only')
   * so ghost entities from single-pass LLM extractions never reach consumers.
   * Pass includeUnconfirmed=true for internal tooling or admin views.
   */
  async getEntities(userId: string, type?: EntityType, includeUnconfirmed = false): Promise<Entity[]> {
    let query = supabaseAdmin
      .from('omega_entities')
      .select(OMEGA_ENTITY_COLS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }
    if (!includeUnconfirmed) {
      query = query.neq('mention_status', 'mentioned_only');
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, type }, 'Failed to get entities');
      throw error;
    }

    return data || [];
  }

  /**
   * Get claims for an entity
   */
  async getClaimsForEntity(userId: string, entityId: string, activeOnly: boolean = true): Promise<Claim[]> {
    let query = supabaseAdmin
      .from('omega_claims')
      .select(OMEGA_CLAIM_COLS)
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .order('start_time', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, entityId }, 'Failed to get claims');
      throw error;
    }

    return data || [];
  }
}

export const omegaMemoryService = new OmegaMemoryService();
