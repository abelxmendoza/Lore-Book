import { MemoryRetriever } from '../services/chat/memoryRetriever';
import { entityRelationshipDetector } from '../services/conversationCentered/entityRelationshipDetector';
import type { EntityType } from '../services/conversationCentered/entityRelationshipDetector';
import { listCertifiedEntities } from '../services/entities/certifiedEntityIndexService';
import { searchEntities } from '../services/search/entitySearchService';
import type { EntitySearchType } from '../services/search/entitySearchTypes';
import { supabaseAdmin } from '../services/supabaseClient';
import { TimelineEngine } from '../services/timeline/timelineEngine';
import type { MemoryEntry } from '../types';
import { JOURNAL_COLS } from '../db/journalEntryColumns';

import { auditMcpToolCall } from './mcpAuditService';
import {
  bundleFromSources,
  emptyProvenance,
  sourceFromEntity,
  sourceFromJournalEntry,
  sourceFromTimelineEvent,
} from './provenanceBundle';
import type {
  GetEntityInput,
  GetRelationshipsInput,
  GetTimelineInput,
  McpAuthContext,
  McpToolResult,
  SearchEntitiesInput,
  SearchMemoriesInput,
} from './types';
import { MCP_TOOL_VERSION } from './types';

const memoryRetriever = new MemoryRetriever();
const timelineEngine = new TimelineEngine();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function wrapResult<T>(
  ctx: McpAuthContext,
  data: T,
  provenance = emptyProvenance()
): McpToolResult<T> {
  return {
    ok: true,
    data,
    provenance,
    tool_version: MCP_TOOL_VERSION,
    request_id: ctx.requestId,
  };
}

function filterEntriesByDate(
  entries: MemoryEntry[],
  dateFrom?: string,
  dateTo?: string
): MemoryEntry[] {
  return entries.filter((entry) => {
    const d = entry.date?.slice(0, 10);
    if (!d) return true;
    if (dateFrom && d < dateFrom.slice(0, 10)) return false;
    if (dateTo && d > dateTo.slice(0, 10)) return false;
    return true;
  });
}

async function withAudit<T>(
  ctx: McpAuthContext,
  toolName: string,
  input: unknown,
  fn: () => Promise<{ result: McpToolResult<T>; artifactIds?: string[] }>
): Promise<McpToolResult<T>> {
  const started = Date.now();
  try {
    const { result, artifactIds } = await fn();
    void auditMcpToolCall({
      ctx,
      toolName,
      input,
      status: 'ok',
      latencyMs: Date.now() - started,
      outputArtifactIds: artifactIds,
    });
    return result;
  } catch (error) {
    void auditMcpToolCall({
      ctx,
      toolName,
      input,
      status: 'error',
      latencyMs: Date.now() - started,
      errorCode: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

export async function mcpSearchMemories(
  ctx: McpAuthContext,
  input: SearchMemoriesInput
): Promise<McpToolResult<{ memories: MemoryEntry[]; count: number }>> {
  return withAudit(ctx, 'search_memories', input, async () => {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 30);
    const context = await memoryRetriever.retrieve(ctx.user.id, limit, input.query);
    let memories = filterEntriesByDate(context.entries ?? [], input.date_from, input.date_to);
    memories = memories.slice(0, limit);
    const provenance = bundleFromSources(memories.map((m) => sourceFromJournalEntry(m)));
    const result = wrapResult(ctx, { memories, count: memories.length }, provenance);
    return { result, artifactIds: memories.map((m) => m.id) };
  });
}

export async function mcpSearchEntities(
  ctx: McpAuthContext,
  input: SearchEntitiesInput
): Promise<McpToolResult<{ entities: Awaited<ReturnType<typeof searchEntities>>['results']; count: number }>> {
  return withAudit(ctx, 'search_entities', input, async () => {
    const limit = Math.min(Math.max(input.limit ?? 15, 1), 40);
    const types = input.types as EntitySearchType[] | undefined;
    const response = await searchEntities({
      userId: ctx.user.id,
      query: input.query,
      types,
      limit,
    });
    const provenance = bundleFromSources(response.results.map(sourceFromEntity));
    const result = wrapResult(
      ctx,
      { entities: response.results, count: response.results.length },
      provenance
    );
    return { result, artifactIds: response.results.map((e) => e.entityId) };
  });
}

async function resolveEntityType(
  userId: string,
  entityId: string
): Promise<{ type: EntityType; name: string } | null> {
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .eq('id', entityId)
    .maybeSingle();

  if (character) {
    return { type: 'character', name: character.name };
  }

  const { data: omega } = await supabaseAdmin
    .from('omega_entities')
    .select('id, primary_name')
    .eq('user_id', userId)
    .eq('id', entityId)
    .maybeSingle();

  if (omega) {
    return { type: 'omega_entity', name: omega.primary_name ?? entityId };
  }

  return null;
}

export async function mcpGetEntity(
  ctx: McpAuthContext,
  input: GetEntityInput
): Promise<McpToolResult<{ entity: Record<string, unknown> | null }>> {
  return withAudit<{ entity: Record<string, unknown> | null }>(ctx, 'get_entity', input, async () => {
    const rawId = input.id.replace(/^(char_|omega_)/, '');
    if (!UUID_RE.test(rawId)) {
      const certified = await listCertifiedEntities(ctx.user.id);
      const match = certified.find((e) => e.id === rawId || e.id === input.id);
      if (!match) {
        return { result: wrapResult(ctx, { entity: null }, emptyProvenance()) };
      }
      const relCount = await countRelationships(ctx.user.id, match.id, 'character');
      const entity = {
        id: match.id,
        name: match.name,
        type: match.type,
        aliases: match.aliases,
        relationship_count: relCount,
        lifecycle_status: match.lifecycleStatus ?? 'active',
      };
      const provenance = bundleFromSources([
        {
          artifact_type: match.type,
          artifact_id: match.id,
          relation: 'entity_card',
          excerpt: match.name,
        },
      ]);
      return { result: wrapResult(ctx, { entity }, provenance), artifactIds: [match.id] };
    }

    const resolved = await resolveEntityType(ctx.user.id, rawId);
    if (!resolved) {
      const certified = await listCertifiedEntities(ctx.user.id);
      const match = certified.find((e) => e.id === rawId);
      if (!match) {
        return { result: wrapResult(ctx, { entity: null }, emptyProvenance()) };
      }
      const relCount = await countRelationships(ctx.user.id, match.id, 'character');
      const entity = {
        id: match.id,
        name: match.name,
        type: match.type,
        aliases: match.aliases,
        relationship_count: relCount,
      };
      return {
        result: wrapResult(
          ctx,
          { entity },
          bundleFromSources([
            { artifact_type: match.type, artifact_id: match.id, relation: 'entity_card', excerpt: match.name },
          ])
        ),
        artifactIds: [match.id],
      };
    }

    const relCount = await countRelationships(ctx.user.id, rawId, resolved.type);
    let claimsCount = 0;
    if (resolved.type === 'omega_entity') {
      const { count } = await supabaseAdmin
        .from('omega_claims')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.user.id)
        .eq('entity_id', rawId);
      claimsCount = count ?? 0;
    }

    const entity = {
      id: rawId,
      name: resolved.name,
      type: resolved.type,
      relationship_count: relCount,
      claims_count: claimsCount,
    };

    return {
      result: wrapResult(
        ctx,
        { entity },
        bundleFromSources([
          {
            artifact_type: resolved.type,
            artifact_id: rawId,
            relation: 'entity_card',
            excerpt: resolved.name,
          },
        ])
      ),
      artifactIds: [rawId],
    };
  });
}

async function countRelationships(
  userId: string,
  entityId: string,
  entityType: EntityType
): Promise<number> {
  const rels = await entityRelationshipDetector.getEntityRelationships(userId, entityId, entityType);
  return rels.length;
}

export async function mcpGetTimeline(
  ctx: McpAuthContext,
  input: GetTimelineInput
): Promise<McpToolResult<{ events: ReturnType<TimelineEngine['getTimeline']> extends Promise<infer U> ? U : never; count: number }>> {
  return withAudit(ctx, 'get_timeline', input, async () => {
    const startDate = new Date(input.start_date);
    const endDate = new Date(input.end_date);
    const events = await timelineEngine.getTimeline(ctx.user.id, {
      startDate,
      endDate,
      limit: 100,
    });

    let filtered = events;
    if (input.entity_id) {
      const entityId = input.entity_id.replace(/^(char_|omega_)/, '');
      filtered = events.filter((event) => {
        const meta = event.metadata ?? {};
        const linked = [
          meta.character_id,
          meta.entity_id,
          meta.source_character_id,
          ...(Array.isArray(meta.entity_ids) ? meta.entity_ids : []),
        ].filter(Boolean);
        return linked.some((id) => String(id) === entityId);
      });
    }

    const provenance = bundleFromSources(filtered.map(sourceFromTimelineEvent));
    const serialized = filtered.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      event_date: e.eventDate.toISOString(),
      source_type: e.sourceType,
      source_id: e.sourceId,
      tags: e.tags,
      confidence: e.confidence,
    }));

    return {
      result: wrapResult(ctx, { events: serialized as never, count: serialized.length }, provenance),
      artifactIds: serialized.map((e) => e.id),
    };
  });
}

export async function mcpGetRelationships(
  ctx: McpAuthContext,
  input: GetRelationshipsInput
): Promise<McpToolResult<{ relationships: Array<Record<string, unknown>>; count: number }>> {
  return withAudit(ctx, 'get_relationships', input, async () => {
    const entityId = input.entity_id.replace(/^(char_|omega_)/, '');
    const resolved = await resolveEntityType(ctx.user.id, entityId);
    if (!resolved) {
      return { result: wrapResult(ctx, { relationships: [], count: 0 }, emptyProvenance()) };
    }

    const direction = input.direction ?? 'both';
    const raw = await entityRelationshipDetector.getEntityRelationships(
      ctx.user.id,
      entityId,
      resolved.type
    );

    const relationships = raw
      .filter((rel) => {
        if (direction === 'outbound') {
          return rel.fromEntityId === entityId;
        }
        if (direction === 'inbound') {
          return rel.toEntityId === entityId;
        }
        return true;
      })
      .map((rel) => ({
        from_entity_id: rel.fromEntityId,
        from_entity_type: rel.fromEntityType,
        to_entity_id: rel.toEntityId,
        to_entity_type: rel.toEntityType,
        relationship_type: rel.relationshipType,
        scope: rel.scope,
        confidence: rel.confidence,
        evidence: rel.evidence,
        evidence_source_ids: rel.evidenceSourceIds,
      }));

    const provenance = bundleFromSources(
      relationships.flatMap((rel) =>
        (rel.evidence_source_ids as string[]).map((id) => ({
          artifact_type: 'evidence_source',
          artifact_id: id,
          relation: 'supports_relationship',
        }))
      )
    );

    // Supplement with journal entries when entity is a character
    if (resolved.type === 'character' && relationships.length === 0) {
      const { data: charRels } = await supabaseAdmin
        .from('character_relationships')
        .select('id, source_character_id, target_character_id, relationship_type, status, metadata')
        .eq('user_id', ctx.user.id)
        .or(`source_character_id.eq.${entityId},target_character_id.eq.${entityId}`)
        .limit(30);

      for (const rel of charRels ?? []) {
        relationships.push({
          from_entity_id: rel.source_character_id,
          from_entity_type: 'character',
          to_entity_id: rel.target_character_id,
          to_entity_type: 'character',
          relationship_type: rel.relationship_type,
          scope: 'CHARACTER_GRAPH',
          confidence: 1,
          evidence: '',
          evidence_source_ids: [],
        });
      }
    }

    return {
      result: wrapResult(
        ctx,
        { relationships, count: relationships.length },
        provenance.sources.length ? provenance : emptyProvenance()
      ),
      artifactIds: relationships.map((r) => `${r.from_entity_id}:${r.to_entity_id}`),
    };
  });
}

/** Fetch recent journal entries for timeline enrichment when timeline_events is sparse */
export async function fetchJournalEntriesInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MemoryEntry[]> {
  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select(JOURNAL_COLS)
    .eq('user_id', userId)
    .gte('date', startDate.slice(0, 10))
    .lte('date', endDate.slice(0, 10))
    .order('date', { ascending: true })
    .limit(50);

  return (data ?? []) as unknown as MemoryEntry[];
}
