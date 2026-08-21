import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { chronologyService } from './chronologyService';
import {
  clusterDuplicateEvents,
  buildMergeLog,
  type MergeLogEntry,
} from './eventCanonicalization';
import {
  buildNarrativeAnchor,
  attachAnchorEntityNames,
  classifyCandidate,
  type CohesionCandidate,
} from './narrativeCohesion';
import { projectCanonicalTimeline } from '../chronologyAuthority/canonicalTimelineProjector';
import type { CanonicalTemporalModel } from '../temporal/canonicalTemporalModel';
import { projectTemporalItem, type TemporalSurfaceProjection } from '../temporal/temporalSurfaceProjection';
import { getUserTimezone } from '../temporal/userTimezoneService';
import {
  eventAcceptedForOrganization,
  readOrganizationAttributions,
  type OrganizationAttribution,
} from '../organizations/organizationEventAttribution';
import {
  buildHistoricalNeighborhoods,
  type HistoricalNeighborhood,
  type ProjectedNarrativeRelation,
  type ProjectedTemporalRelation,
} from './temporalParallelProjection';

export type StitchedItemKind = 'moment' | 'event';
export type ChronologyScopeType = 'global' | 'life_arc';

export const GLOBAL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

function resolvedEventBelongsToOrganization(
  row: { metadata?: unknown },
  organizationId: string,
): boolean {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const attributions = readOrganizationAttributions(metadata);
  if (attributions.length > 0) {
    return eventAcceptedForOrganization(attributions, organizationId);
  }
  const ids = Array.isArray(metadata.organization_ids) ? metadata.organization_ids : [];
  return ids.some((id) => String(id) === organizationId);
}

function attributionsFromResolvedRow(row: { metadata?: unknown }): OrganizationAttribution[] {
  return readOrganizationAttributions((row.metadata ?? {}) as Record<string, unknown>);
}

export type StitchedTimelineItem = {
  id: string;
  kind: StitchedItemKind;
  sourceId: string;
  sortTime: string;
  userSortIndex: number | null;
  title: string;
  body: string;
  /** Canonical backing record. sourceIds also contains merged aliases. */
  sourceKind: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceIds: string[];
  /** Ingestion provenance such as calendar, chat, manual, or resolved_event. */
  sourceType: string;
  tags?: string[];
  confidence?: number;
  userPresence?: 'attended' | 'heard_about' | 'unknown';
  temporalRole?: string;
  /** Narrative cohesion score vs. the arc's anchor (0–100), when gated. */
  cohesion?: number;
  /** How much this scene helps tell the chapter's thesis (0–100). */
  contribution?: number;
  /** Number of extracted duplicates collapsed into this canonical event. */
  mergedCount?: number;
  /** Titles of the merged-away duplicates (excludes the shown title). */
  mergedTitles?: string[];
  /** Honest temporal fields for Omni Chronology Authority. */
  timePrecision?: string;
  timeConfidence?: number;
  temporalSource?: string;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  projectionRole?: 'canonical' | 'evidence' | 'unresolved' | 'excluded';
  canonicalEventType?: string;
  speechAct?: string;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  knownFrom?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  /** Independent temporal coordinates; sortTime remains a compatibility field. */
  temporal?: CanonicalTemporalModel;
  /** Shared Omni/Calendar projection. Occurrence meaning is fixed here. */
  temporalProjection?: TemporalSurfaceProjection;
  /** Event→organization roles. Presence is not membership. */
  organizationAttributions?: OrganizationAttribution[];
};

export type NarrativeChapterData = {
  title: string;
  thesis: string;
  dominantTheme: string;
  startDate: string | null;
  endDate: string | null;
  participants: string[];
  locations: string[];
  supportingEventIds: string[];
  backgroundEventIds: string[];
  backgroundContext: string[];
  outcomes: string[];
  contributionScores: Record<string, number>;
  quality: Record<string, number>;
  confidence: number;
};

export type StitchedTimelineResult = {
  scope_type: ChronologyScopeType;
  scope_id: string;
  scope_label: string | null;
  items: StitchedTimelineItem[];
  has_user_order: boolean;
  /** Persistent-state facts from the same period — context, not scene events. */
  background?: StitchedTimelineItem[];
  /** Same-window items dropped for lacking narrative cohesion with the scene. */
  excluded_count?: number;
  /** Duplicate-event merges applied before stitching (canonicalization). */
  merge_log?: MergeLogEntry[];
  /** Story identity generated before the title and used to gate scenes. */
  chapter?: NarrativeChapterData;
  /** Temporally unresolved / low-trust items (Omni unresolved-date tray). */
  unresolved_items?: StitchedTimelineItem[];
  /** Journal evidence collapsed under canonical resolved events. */
  evidence_hidden_count?: number;
  /** Projection-only parallel lanes; canonical records remain the source of truth. */
  historical_neighborhoods?: HistoricalNeighborhood[];
  temporal_relations?: ProjectedTemporalRelation[];
  /** Autobiographical meaning, kept separate from objective chronology. */
  narrative_relations?: ProjectedNarrativeRelation[];
};

async function loadTemporalRelations(userId: string): Promise<ProjectedTemporalRelation[]> {
  const { data, error } = await supabaseAdmin
    .from('canonical_temporal_relations')
    .select('id, source_ref_id, source_label, target_ref_id, target_label, relation_type, confidence, evidence_phrase, source_message_id, source_assertion_ids')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    logger.debug({ error, userId }, 'Temporal relation projection unavailable');
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    sourceId: (row.source_ref_id as string | null) ?? null,
    sourceLabel: row.source_label as string,
    targetId: (row.target_ref_id as string | null) ?? null,
    targetLabel: row.target_label as string,
    relation: row.relation_type as ProjectedTemporalRelation['relation'],
    confidence: Number(row.confidence ?? 0.5),
    evidencePhrase: (row.evidence_phrase as string) ?? '',
    sourceMessageId: (row.source_message_id as string) ?? '',
    sourceAssertionIds: (row.source_assertion_ids as string[]) ?? [],
  }));
}

async function loadNarrativeRelations(userId: string): Promise<ProjectedNarrativeRelation[]> {
  const { data, error } = await supabaseAdmin
    .from('graph_edges')
    .select('id, from_node_id, to_node_id, relation_kind, confidence, meta, valid_to')
    .eq('user_id', userId)
    .in('relation_kind', [
      'CONSIDERED_BEGINNING_OF', 'TURNING_POINT_IN', 'END_OF_CHAPTER',
      'DEFINING_PERIOD_OF', 'RETURN_TO', 'RESTART_OF',
    ])
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    logger.debug({ error, userId }, 'Narrative relation projection unavailable');
    return [];
  }
  const activeRows = (data ?? []).filter((row) => !row.valid_to);
  const nodeIds = [...new Set(activeRows.flatMap((row) => [row.from_node_id, row.to_node_id]))];
  const { data: nodes } = nodeIds.length
    ? await supabaseAdmin.from('graph_nodes').select('id, display_name').eq('user_id', userId).in('id', nodeIds)
    : { data: [] };
  const labelById = new Map((nodes ?? []).map((node) => [node.id as string, node.display_name as string]));

  return activeRows.map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      sourceId: (row.from_node_id as string | null) ?? null,
      sourceLabel: labelById.get(row.from_node_id as string) ?? 'Unknown subject',
      targetId: (row.to_node_id as string | null) ?? null,
      targetLabel: labelById.get(row.to_node_id as string) ?? 'Unknown chapter',
      relation: row.relation_kind as ProjectedNarrativeRelation['relation'],
      confidence: Number(row.confidence ?? 0.5),
      evidencePhrase: (meta.evidence_phrase as string) ?? '',
      sourceMessageId: (meta.source_message_id as string) ?? '',
      sourceMessageIds: (meta.source_message_ids as string[]) ?? [],
      sourceThreadIds: (meta.source_thread_ids as string[]) ?? [],
      sourceAssertionIds: (meta.source_assertion_ids as string[]) ?? [],
      conversationTime: (meta.conversation_time as string | null) ?? null,
      knowledgeTime: (meta.knowledge_time as string) ?? '',
    };
  });
}

function momentTitle(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  if (line.length <= 72) return line;
  return line.slice(0, 69) + '…';
}

function sortItems(items: StitchedTimelineItem[]): StitchedTimelineItem[] {
  const hasUserOrder = items.some((i) => i.userSortIndex != null);
  if (!hasUserOrder) {
    return [...items].sort(
      (a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime()
    );
  }
  return [...items].sort((a, b) => {
    const ai = a.userSortIndex ?? Number.MAX_SAFE_INTEGER;
    const bi = b.userSortIndex ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime();
  });
}

async function loadUserOrder(
  userId: string,
  scopeType: ChronologyScopeType,
  scopeId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin
    .from('user_chronology_order')
    .select('item_kind, item_id, sort_index')
    .eq('user_id', userId)
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId);

  if (error) {
    logger.warn({ error, userId, scopeType }, 'Failed to load user chronology order');
    return new Map();
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(`${row.item_kind}:${row.item_id}`, row.sort_index);
  }
  return map;
}

async function resolveArcWindow(
  userId: string,
  lifeArcId: string
): Promise<{
  start?: string;
  end?: string;
  label: string | null;
  arc_type?: string;
  metadata?: Record<string, unknown>;
  summary?: string | null;
  tags?: string[];
  confidence?: number;
}> {
  const { data: arc } = await supabaseAdmin
    .from('life_arcs')
    .select('title, start_date, end_date, arc_type, metadata, summary, tags, confidence')
    .eq('user_id', userId)
    .eq('id', lifeArcId)
    .maybeSingle();

  if (!arc) return { label: null };
  return {
    start: arc.start_date ?? undefined,
    end: arc.end_date ?? undefined,
    label: arc.title ?? null,
    arc_type: arc.arc_type ?? undefined,
    metadata: (arc.metadata as Record<string, unknown>) ?? {},
    summary: arc.summary ?? null,
    tags: (arc.tags as string[]) ?? [],
    confidence: Number(arc.confidence ?? 0.5),
  };
}

function chapterFromMetadata(
  title: string | null,
  metadata: Record<string, unknown> | undefined,
  confidence = 0.5,
  startDate: string | null = null,
  endDate: string | null = null,
): NarrativeChapterData | undefined {
  const thesis = metadata?.chapter_thesis as string | undefined;
  if (!thesis) return undefined;
  return {
    title: title ?? 'Life chapter',
    thesis,
    dominantTheme: (metadata?.dominant_theme as string | undefined) ?? 'Life chapter',
    startDate,
    endDate,
    participants: (metadata?.participant_ids as string[] | undefined) ?? [],
    locations: (metadata?.location_ids as string[] | undefined) ?? [],
    supportingEventIds: (metadata?.source_event_ids as string[] | undefined) ?? [],
    backgroundEventIds: (metadata?.background_event_ids as string[] | undefined) ?? [],
    backgroundContext: (metadata?.background_context as string[] | undefined) ?? [],
    outcomes: (metadata?.outcomes as string[] | undefined) ?? [],
    contributionScores: (metadata?.contribution_scores as Record<string, number> | undefined) ?? {},
    quality: (metadata?.chapter_quality as Record<string, number> | undefined) ?? {},
    confidence,
  };
}

async function loadNarrativeChapter(
  userId: string,
  lifeArcId: string,
  fallback: NarrativeChapterData | undefined,
): Promise<NarrativeChapterData | undefined> {
  const { data, error } = await supabaseAdmin
    .from('narrative_chapters')
    .select('title, thesis, dominant_theme, start_date, end_date, participant_ids, location_ids, supporting_event_ids, background_event_ids, background_context, outcomes, contribution_scores, quality, confidence')
    .eq('user_id', userId)
    .eq('life_arc_id', lifeArcId)
    .maybeSingle();
  if (error) {
    logger.warn({ error, userId, lifeArcId }, 'Failed to load narrative chapter projection');
    return fallback;
  }
  if (!data) return fallback;
  return {
    title: data.title as string,
    thesis: data.thesis as string,
    dominantTheme: data.dominant_theme as string,
    startDate: (data.start_date as string | null) ?? null,
    endDate: (data.end_date as string | null) ?? null,
    participants: (data.participant_ids as string[]) ?? [],
    locations: (data.location_ids as string[]) ?? [],
    supportingEventIds: (data.supporting_event_ids as string[]) ?? [],
    backgroundEventIds: (data.background_event_ids as string[]) ?? [],
    backgroundContext: (data.background_context as string[]) ?? [],
    outcomes: (data.outcomes as string[]) ?? [],
    contributionScores: (data.contribution_scores as Record<string, number>) ?? {},
    quality: (data.quality as Record<string, number>) ?? {},
    confidence: Number(data.confidence ?? 0.5),
  };
}

/**
 * Narrative cohesion gate for window-scoped arc timelines.
 *
 * The plain date-window branch used to admit everything in the arc's window,
 * which over-stitched unrelated threads into one scene. Build an anchor from
 * the arc + its seed-matching events, classify every item, and split the
 * result into scene / background / excluded. Falls back to the unfiltered
 * list when no anchor can be established (better complete than wrong).
 */
async function applyCohesionGate(
  userId: string,
  seed: { title: string; summary?: string | null; tags?: string[] },
  items: StitchedTimelineItem[],
  candidatesByKey: Map<string, CohesionCandidate>,
): Promise<{ scene: StitchedTimelineItem[]; background: StitchedTimelineItem[]; excludedCount: number } | null> {
  const anchor = buildNarrativeAnchor(seed, [...candidatesByKey.values()]);
  if (!anchor) return null;

  // Resolve display names for anchor entities so text-only moments that
  // mention them by name ("went shopping with …") still match.
  const peopleIds = [...anchor.peopleIds];
  const locationIds = [...anchor.locationIds];
  const [charsRes, locsRes] = await Promise.all([
    peopleIds.length
      ? supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).in('id', peopleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    locationIds.length
      ? supabaseAdmin.from('locations').select('id, name').eq('user_id', userId).in('id', locationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);
  attachAnchorEntityNames(
    anchor,
    (charsRes.data ?? []).map((c) => c.name ?? '').filter(Boolean),
    (locsRes.data ?? []).map((l) => l.name ?? '').filter(Boolean),
  );

  const scene: StitchedTimelineItem[] = [];
  const background: StitchedTimelineItem[] = [];
  let excludedCount = 0;

  for (const item of items) {
    const candidate = candidatesByKey.get(item.id);
    if (!candidate) {
      scene.push(item);
      continue;
    }
    const verdict = classifyCandidate(anchor, candidate, {
      userPinned: item.userSortIndex != null,
    });
    item.cohesion = verdict.score;
    item.contribution = verdict.score;
    if (verdict.cls === 'scene') scene.push(item);
    else if (verdict.cls === 'background') background.push(item);
    else excludedCount++;
  }

  return { scene, background, excludedCount };
}

async function loadOccasionLinks(userId: string, arcId: string) {
  const { data, error } = await supabaseAdmin
    .from('arc_event_links')
    .select('resolved_event_id, journal_entry_id, user_presence, temporal_role, sort_time')
    .eq('user_id', userId)
    .eq('arc_id', arcId)
    .order('sort_time', { ascending: true });

  if (error) {
    logger.warn({ error, userId, arcId }, 'Failed to load occasion arc links');
    return [];
  }
  return data ?? [];
}

async function loadNarrativeArcEventIds(
  userId: string,
  arcId: string,
  metadata?: Record<string, unknown>,
): Promise<string[]> {
  const fromMeta = (metadata?.source_event_ids as string[] | undefined) ?? [];
  if (fromMeta.length > 0) return fromMeta;

  const { data: memberships } = await supabaseAdmin
    .from('arc_memberships')
    .select('event_candidate_id')
    .eq('user_id', userId)
    .eq('arc_id', arcId);

  if (!memberships?.length) return [];

  const candidateIds = memberships.map((m) => m.event_candidate_id as string);
  const { data: candidates } = await supabaseAdmin
    .from('event_candidates')
    .select('source_event_ids')
    .in('id', candidateIds);

  const ids = new Set<string>();
  for (const c of candidates ?? []) {
    for (const id of (c.source_event_ids as string[]) ?? []) ids.add(id);
  }
  return [...ids];
}

function attachTemporalProjection(
  items: StitchedTimelineItem[],
  timezone: string,
  now: Date,
): StitchedTimelineItem[] {
  return items.map((item) => ({
    ...item,
    temporalProjection: projectTemporalItem(item, timezone, now),
  }));
}

export class StitchedTimelineService {
  async getStitchedTimeline(
    userId: string,
    opts: {
      scope_type?: ChronologyScopeType;
      life_arc_id?: string;
      start_time?: string;
      end_time?: string;
      /**
       * Restrict the global scope to events involving this character (matched
       * against resolved_events.people). Journal moments and timeline_events
       * carry no character linkage today, so they're excluded rather than guessed.
       */
      character_id?: string;
      /**
       * Restrict the global scope to events at this location (matched against
       * resolved_events.locations). Same honest-subset rule as character_id.
       */
      location_id?: string;
      /**
       * Restrict the global scope to events attributed to this organization
       * (canonical IDs in metadata.organizationAttributions). Not name search,
       * member overlap, or same-thread co-mention.
       */
      organization_id?: string;
      /**
       * Optional title/summary text filter when the caller has a named subject
       * but no canonical entity id. Does not replace entity/date bounds.
       */
      text_query?: string;
      timezone?: string;
      /**
       * Cap the final item count after sorting/clustering (applied last, so a
       * cap never discards dedup accuracy). Undefined = unbounded, matching
       * every existing caller's behavior; callers issuing this per request
       * (e.g. a chat turn) should pass an explicit cap to keep it cheap.
       */
      limit?: number;
    } = {}
  ): Promise<StitchedTimelineResult> {
    const scopeType: ChronologyScopeType =
      opts.scope_type ?? (opts.life_arc_id ? 'life_arc' : 'global');
    const scopeId =
      scopeType === 'life_arc' && opts.life_arc_id ? opts.life_arc_id : GLOBAL_SCOPE_ID;

    const timezone = opts.timezone ?? await getUserTimezone(userId);
    const projectionNow = new Date();

    let startTime = opts.start_time;
    let endTime = opts.end_time;
    let scopeLabel: string | null = null;
    let arcSummary: string | null = null;
    let arcTags: string[] = [];
    let isOccasionArc = false;
    let isNarrativeConsolidationArc = false;
    let narrativeEventIds: string[] = [];
    let chapter: NarrativeChapterData | undefined;
    let chapterBackground: StitchedTimelineItem[] = [];
    let occasionLinks: Awaited<ReturnType<typeof loadOccasionLinks>> = [];
    let mergeLog: MergeLogEntry[] | undefined;

    if (scopeType === 'life_arc' && opts.life_arc_id) {
      const window = await resolveArcWindow(userId, opts.life_arc_id);
      startTime = startTime ?? window.start;
      endTime = endTime ?? window.end;
      scopeLabel = window.label;
      arcSummary = window.summary ?? null;
      arcTags = window.tags ?? [];
      isOccasionArc = window.arc_type === 'occasion';
      isNarrativeConsolidationArc =
        window.metadata?.detector === 'narrative_consolidation' ||
        window.metadata?.detector === 'narrative_chapter' ||
        ((window.metadata?.source_event_ids as string[] | undefined)?.length ?? 0) > 0;
      if (isNarrativeConsolidationArc) {
        const fallbackChapter = chapterFromMetadata(
          scopeLabel,
          window.metadata,
          window.confidence,
          window.start ?? null,
          window.end ?? null,
        );
        chapter = await loadNarrativeChapter(userId, opts.life_arc_id, fallbackChapter);
      }
      if (isOccasionArc) {
        occasionLinks = await loadOccasionLinks(userId, opts.life_arc_id);
      } else if (isNarrativeConsolidationArc) {
        narrativeEventIds = chapter?.supportingEventIds.length
          ? chapter.supportingEventIds
          : await loadNarrativeArcEventIds(userId, opts.life_arc_id, window.metadata);
      }
    }

    const entityScoped = Boolean(opts.character_id || opts.location_id || opts.organization_id);
    const textQuery = opts.text_query?.trim();

    const emptyQueryResult = { data: [] as any[], error: null as null };
    const loadResolvedEvents = async (pushEntityFilters: boolean) => {
      let query = supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, end_time, confidence, metadata, people, locations, activities, tags, temporal_precision, temporal_source, temporal_status, temporal_confidence, temporal_expression, created_at')
        .eq('user_id', userId);
      if (startTime) {
        const lowerBound = `${startTime}T00:00:00.000Z`;
        query = query.or(`start_time.gte.${lowerBound},end_time.gte.${lowerBound},start_time.is.null`);
      }
      if (endTime) {
        const upperBound = `${endTime}T23:59:59.999Z`;
        query = query.or(`start_time.lte.${upperBound},start_time.is.null`);
      }
      if (pushEntityFilters && opts.character_id) {
        query = query.contains('people', [opts.character_id]);
      }
      if (pushEntityFilters && opts.location_id) {
        query = query.contains('locations', [opts.location_id]);
      }
      if (!entityScoped && textQuery) {
        const escaped = textQuery.replace(/[%_,]/g, ' ').slice(0, 80);
        query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%`);
      }
      return query.order('start_time', { ascending: true, nullsFirst: false });
    };

    const [moments, timelineEventsRes, resolvedEventsRes, orderMap, temporalRelations, narrativeRelations] = await Promise.all([
      entityScoped
        ? Promise.resolve([] as Awaited<ReturnType<typeof chronologyService.getChronologicalOrder>>)
        : chronologyService.getChronologicalOrder(userId, startTime, endTime),
      entityScoped
        ? Promise.resolve(emptyQueryResult)
        : (async () => {
            let query = supabaseAdmin
              .from('timeline_events')
              .select('id, title, description, event_date, occurred_at, confidence, source_type, created_at')
              .eq('user_id', userId);
            if (startTime) query = query.gte('event_date', startTime);
            if (endTime) query = query.lte('event_date', endTime);
            return query.order('event_date', { ascending: true });
          })(),
      loadResolvedEvents(entityScoped),
      loadUserOrder(userId, scopeType, scopeId),
      loadTemporalRelations(userId),
      loadNarrativeRelations(userId),
    ]);

    let resolvedRows = resolvedEventsRes.data;
    let resolvedError = resolvedEventsRes.error;
    if (resolvedError && entityScoped) {
      logger.warn({ error: resolvedError, userId }, 'Entity-scoped resolved_events filter failed; retrying without SQL entity contains');
      const retry = await loadResolvedEvents(false);
      resolvedRows = retry.data;
      resolvedError = retry.error;
    }
    const { data: eventRows, error: eventsError } = timelineEventsRes;
    if (eventsError) {
      logger.warn({ error: eventsError, userId }, 'Failed to load timeline events for stitch');
    }
    if (resolvedError) {
      logger.warn({ error: resolvedError, userId }, 'Failed to load resolved events for stitch');
    }

    const items: StitchedTimelineItem[] = [];
    const seenEventIds = new Set<string>();

    if (isOccasionArc && occasionLinks.length > 0) {
      const eventIds = occasionLinks.filter(l => l.resolved_event_id).map(l => l.resolved_event_id!);
      const journalIds = occasionLinks.filter(l => l.journal_entry_id).map(l => l.journal_entry_id!);

      const [linkedEvents, linkedJournal] = await Promise.all([
        eventIds.length
          ? supabaseAdmin.from('resolved_events').select('id, title, summary, start_time, confidence, metadata, tags').in('id', eventIds)
          : Promise.resolve({ data: [] as any[] }),
        journalIds.length
          ? supabaseAdmin.from('journal_entries').select('id, content, date, source, tags, created_at').in('id', journalIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      for (const link of occasionLinks) {
        if (link.resolved_event_id) {
          const e = (linkedEvents.data ?? []).find(r => r.id === link.resolved_event_id);
          if (!e) continue;
          const key = `event:${e.id}`;
          items.push({
            id: key,
            kind: 'event',
            sourceId: e.id,
            sortTime: link.sort_time ?? e.start_time,
            userSortIndex: orderMap.get(key) ?? null,
            title: e.title ?? 'Event',
            body: e.summary ?? '',
            sourceKind: 'resolved_event',
            sourceIds: [e.id],
            sourceType: (((e.metadata ?? {}) as Record<string, unknown>).source_type as string | undefined) ?? 'resolved_event',
            tags: (e.tags as string[]) ?? [],
            confidence: e.confidence ?? 1,
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
            temporalRole: link.temporal_role ?? undefined,
          });
          seenEventIds.add(e.id);
        }
        if (link.journal_entry_id) {
          const m = (linkedJournal.data ?? []).find(j => j.id === link.journal_entry_id);
          if (!m) continue;
          const sourceId = m.id;
          const key = `moment:${sourceId}`;
          const occurrence = m.date ?? null;
          items.push({
            id: key,
            kind: 'moment',
            sourceId,
            sortTime: (link.sort_time ?? occurrence ?? m.created_at) as string,
            userSortIndex: orderMap.get(key) ?? null,
            title: momentTitle(m.content),
            body: m.content,
            sourceKind: 'journal_entry',
            sourceIds: [sourceId],
            sourceType: m.source ?? 'manual',
            tags: (m.tags as string[]) ?? [],
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'attended',
            temporalRole: link.temporal_role ?? undefined,
            occurredAt: occurrence,
            occurrenceStatus: occurrence ? 'confirmed' : 'unresolved',
            projectionRole: occurrence ? 'evidence' : 'unresolved',
            recordedAt: m.created_at ?? null,
          });
        }
      }
    } else if (isNarrativeConsolidationArc && narrativeEventIds.length > 0) {
      const { data: linkedEvents } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, confidence, metadata')
        .eq('user_id', userId)
        .in('id', narrativeEventIds);

      for (const e of linkedEvents ?? []) {
        const key = `event:${e.id}`;
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        const narrative = (meta.narrative_structure ?? {}) as Record<string, unknown>;
        const primaryRole = narrative.primary_arc_membership_role as string | undefined;
        items.push({
          id: key,
          kind: 'event',
          sourceId: e.id,
          sortTime: e.start_time,
          userSortIndex: orderMap.get(key) ?? null,
          title: e.title ?? 'Event',
          body: e.summary ?? '',
          sourceKind: 'resolved_event',
          sourceIds: [e.id],
          sourceType: 'resolved_event',
          confidence: e.confidence ?? 1,
          userPresence: (meta.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
          temporalRole: primaryRole,
          contribution: chapter?.contributionScores[e.id],
        });
        seenEventIds.add(e.id);
      }

      if (chapter?.backgroundEventIds.length) {
        const { data: backgroundRows } = await supabaseAdmin
          .from('resolved_events')
          .select('id, title, summary, start_time, confidence, metadata')
          .eq('user_id', userId)
          .in('id', chapter.backgroundEventIds);
        chapterBackground = (backgroundRows ?? []).map((event) => ({
          id: `event:${event.id}`,
          kind: 'event' as const,
          sourceId: event.id as string,
          sortTime: event.start_time as string,
          userSortIndex: null,
          title: (event.title as string) ?? 'Background context',
          body: (event.summary as string) ?? '',
          sourceKind: 'resolved_event' as const,
          sourceIds: [event.id as string],
          sourceType: 'resolved_event',
          confidence: Number(event.confidence ?? 1),
          contribution: chapter?.contributionScores[event.id as string],
        }));
      }
    } else {
      const candidatesByKey = new Map<string, CohesionCandidate>();
      const characterId = opts.character_id;
      const locationId = opts.location_id;
      const organizationId = opts.organization_id;
      const entityScoped = Boolean(characterId || locationId || organizationId);

      for (const m of entityScoped ? [] : moments) {
        const sourceId = m.journal_entry_id || m.id;
        const key = `moment:${sourceId}`;
        items.push({
          id: key,
          kind: 'moment',
          sourceId,
          sortTime: m.start_time,
          userSortIndex: orderMap.get(key) ?? null,
          title: momentTitle(m.content),
          body: m.content,
          sourceKind: 'journal_entry',
          sourceIds: [sourceId],
          sourceType: m.source_type ?? 'manual',
          tags: m.tags ?? [],
          confidence: m.time_confidence,
          timePrecision: m.time_precision,
          timeConfidence: m.time_confidence,
          temporalSource: m.temporal_source,
          occurredAt: m.temporal_source === 'recording_fallback' ? null : m.start_time,
          mentionedAt: m.mentioned_at,
          recordedAt: m.recorded_at,
          knownFrom: m.recorded_at,
        });
        candidatesByKey.set(key, {
          key,
          kind: 'moment',
          text: m.content,
          time: m.start_time,
        });
      }

      // Canonicalize before stitching: multiple extracted summaries of the
      // same occurrence collapse to one item; the stitcher never sees
      // duplicate paraphrases. Identity comes from structured properties
      // (who/where/what/when), not from generated wording.
      const scopedResolvedRows = characterId
        ? (resolvedRows ?? []).filter((e) => ((e.people as string[] | null) ?? []).includes(characterId))
        : locationId
          ? (resolvedRows ?? []).filter((e) => ((e.locations as string[] | null) ?? []).includes(locationId))
          : organizationId
            ? (resolvedRows ?? []).filter((e) => resolvedEventBelongsToOrganization(e, organizationId))
            : (resolvedRows ?? []);
      const datedResolved = scopedResolvedRows.filter(
        (e) => typeof e.start_time === 'string' && e.start_time.length > 0,
      );
      const undatedResolved = scopedResolvedRows.filter(
        (e) => !(typeof e.start_time === 'string' && e.start_time.length > 0),
      );
      // Undated / unanchored events go straight into items with a sentinel sort
      // time; Chronology Authority will mark them unresolved and Omni will tray them.
      for (const e of undatedResolved) {
        const key = `event:${e.id}`;
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        items.push({
          id: key,
          kind: 'event',
          sourceId: e.id as string,
          sortTime: (meta.recovery_fallback_date as string) || new Date(0).toISOString(),
          userSortIndex: orderMap.get(key) ?? null,
          title: (e.title as string) ?? 'Event',
          body: (e.summary as string) ?? '',
          sourceKind: 'resolved_event',
          sourceIds: [e.id as string],
          sourceType: (meta.source_type as string | undefined) ?? 'resolved_event',
          tags: (e.tags as string[]) ?? [],
          confidence: Number(e.temporal_confidence ?? e.confidence ?? 0.2),
          timePrecision: (e.temporal_precision as string) ?? 'unknown',
          timeConfidence: Number(e.temporal_confidence ?? 0.2),
          temporalSource: (e.temporal_source as string) ?? 'recording_fallback',
          occurredAt: null,
          recordedAt: (e.created_at as string | null) ?? null,
          knownFrom: (e.created_at as string | null) ?? null,
          occurrenceStatus: 'unresolved',
          projectionRole: 'unresolved',
          organizationAttributions: attributionsFromResolvedRow(e),
        });
        seenEventIds.add(e.id as string);
      }

      const clusters = clusterDuplicateEvents(
        datedResolved.map((e) => ({
          id: e.id as string,
          title: (e.title as string) ?? 'Event',
          summary: (e.summary as string) ?? '',
          time: e.start_time as string,
          peopleIds: (e.people as string[]) ?? [],
          locationIds: (e.locations as string[]) ?? [],
          activityIds: (e.activities as string[]) ?? [],
          row: e,
        })),
      );
      mergeLog = buildMergeLog(clusters);

      for (const cluster of clusters) {
        for (const member of cluster.members) seenEventIds.add(member.id);
        const canonical = cluster.members.find((m) => m.id === cluster.canonicalId) ?? cluster.members[0];
        const meta = ((canonical.row as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
        const key = `event:${cluster.canonicalId}`;
        const row = canonical.row as {
          confidence?: number;
          tags?: string[];
          temporal_precision?: string;
          temporal_source?: string;
          temporal_confidence?: number;
          temporal_expression?: string | null;
          created_at?: string | null;
        };
        const temporalMeta = (meta.temporal ?? {}) as Record<string, unknown>;
        const confidence = Math.max(
          ...cluster.members.map((m) => {
            const r = m.row as { temporal_confidence?: number; confidence?: number };
            return r.temporal_confidence ?? r.confidence ?? 1;
          }),
        );
        items.push({
          id: key,
          kind: 'event',
          sourceId: cluster.canonicalId,
          sortTime: cluster.time,
          userSortIndex: orderMap.get(key) ?? null,
          title: cluster.title,
          body: cluster.summary,
          sourceKind: 'resolved_event',
          sourceIds: cluster.members.map((member) => member.id),
          sourceType: (meta.source_type as string | undefined) ?? 'resolved_event',
          tags: [...new Set(cluster.members.flatMap((member) => {
            const memberRow = member.row as { tags?: string[] };
            return memberRow.tags ?? [];
          }))],
          confidence,
          timePrecision: row.temporal_precision ?? 'date',
          timeConfidence: row.temporal_confidence ?? confidence,
          temporalSource: row.temporal_source ?? 'context_inferred',
          occurredAt: cluster.time,
          occurredEnd: (canonical.row as { end_time?: string | null }).end_time ?? null,
          mentionedAt: (temporalMeta.mentioned_at as string | undefined) ?? null,
          recordedAt: row.created_at ?? null,
          knownFrom: (temporalMeta.known_from as string | undefined) ?? row.created_at ?? null,
          validFrom: (temporalMeta.valid_from as string | undefined) ?? null,
          validUntil: (temporalMeta.valid_until as string | undefined) ?? null,
          userPresence: (meta.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
          organizationAttributions: cluster.members.flatMap((member) =>
            attributionsFromResolvedRow(member.row as { metadata?: unknown }),
          ),
          ...(cluster.members.length > 1
            ? { mergedCount: cluster.members.length, mergedTitles: cluster.mergedTitles }
            : {}),
        });
        candidatesByKey.set(key, {
          key,
          kind: 'event',
          text: `${cluster.title} ${cluster.summary} ${cluster.mergedTitles.join(' ')}`,
          time: cluster.time,
          peopleIds: cluster.peopleIds,
          locationIds: cluster.locationIds,
          activityIds: cluster.activityIds,
        });
      }

      for (const e of entityScoped ? [] : eventRows ?? []) {
        if (seenEventIds.has(e.id)) continue;
        const occurredAt = e.occurred_at ?? e.event_date ?? null;
        const sortTime = occurredAt ?? e.created_at ?? new Date(0).toISOString();
        const key = `event:${e.id}`;
        items.push({
          id: key,
          kind: 'event',
          sourceId: e.id,
          sortTime,
          userSortIndex: orderMap.get(key) ?? null,
          title: e.title ?? 'Event',
          body: e.description ?? '',
          sourceKind: 'timeline_event',
          sourceIds: [e.id],
          sourceType: e.source_type ?? 'timeline_event',
          confidence: e.confidence ?? 1,
          occurredAt,
          recordedAt: e.created_at ?? null,
          knownFrom: e.created_at ?? null,
          temporalSource: occurredAt ? 'user_stated' : 'recording_fallback',
          timePrecision: occurredAt ? 'date' : 'unknown',
          timeConfidence: occurredAt ? e.confidence ?? 0.8 : 0,
        });
        candidatesByKey.set(key, {
          key,
          kind: 'event',
          text: `${e.title ?? ''} ${e.description ?? ''}`,
          time: sortTime,
        });
      }

      // Arc scope only: gate the date-window sweep on narrative cohesion.
      // Global timelines stay complete — the user asked for everything there.
      if (scopeType === 'life_arc' && scopeLabel) {
        const gated = await applyCohesionGate(
          userId,
          { title: scopeLabel, summary: arcSummary, tags: arcTags },
          items,
          candidatesByKey,
        );
        if (gated) {
          const sortedScene = sortItems(gated.scene);
          return {
            scope_type: scopeType,
            scope_id: scopeId,
            scope_label: scopeLabel,
            items: attachTemporalProjection(sortedScene, timezone, projectionNow),
            has_user_order: sortedScene.some((i) => i.userSortIndex != null),
            background: attachTemporalProjection(sortItems(gated.background), timezone, projectionNow),
            excluded_count: gated.excludedCount,
            ...(chapter ? { chapter } : {}),
            ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
          };
        }
      }
    }

    // Global Omni feed: Chronology Authority projection (eligibility + temporal honesty).
    if (scopeType === 'global') {
      const projected = projectCanonicalTimeline(
        items.map((item) => ({
          id: item.id,
          kind: item.kind,
          sourceId: item.sourceId,
          sortTime: item.sortTime,
          title: item.title,
          body: item.body,
          sourceKind: item.sourceKind,
          sourceIds: item.sourceIds,
          sourceType: item.sourceType,
          tags: item.tags,
          confidence: item.confidence,
          timePrecision: item.timePrecision,
          timeConfidence: item.timeConfidence,
          temporalSource: item.temporalSource,
          occurredAt: item.occurredAt,
          occurredEnd: item.occurredEnd,
          mentionedAt: item.mentionedAt,
          recordedAt: item.recordedAt,
          knownFrom: item.knownFrom,
          validFrom: item.validFrom,
          validUntil: item.validUntil,
        })),
      );
      const toStitched = (p: (typeof projected.canonical)[number]): StitchedTimelineItem => ({
        id: p.id,
        kind: p.kind,
        sourceId: p.sourceId,
        sortTime: p.sortTime,
        userSortIndex: items.find((i) => i.id === p.id)?.userSortIndex ?? null,
        title: p.title,
        body: p.body,
        sourceKind: p.sourceKind,
        sourceIds: p.sourceIds,
        sourceType: p.sourceType,
        tags: p.tags,
        confidence: p.timeConfidence,
        timePrecision: p.timePrecision,
        timeConfidence: p.timeConfidence,
        temporalSource: p.temporalSource,
        occurrenceStatus: p.occurrenceStatus,
        projectionRole: p.projectionRole,
        canonicalEventType: p.canonicalEventType,
        speechAct: p.speechAct,
        occurredAt: p.temporal.occurred.start,
        occurredEnd: p.temporal.occurred.end,
        mentionedAt: p.temporal.mentionedAt,
        recordedAt: p.temporal.recordedAt,
        knownFrom: p.temporal.knownFrom,
        validFrom: p.temporal.validFrom,
        validUntil: p.temporal.validUntil,
        temporal: p.temporal,
        userPresence: items.find((i) => i.id === p.id)?.userPresence,
        temporalRole: items.find((i) => i.id === p.id)?.temporalRole,
        mergedCount: items.find((i) => i.id === p.id)?.mergedCount,
        mergedTitles: items.find((i) => i.id === p.id)?.mergedTitles,
        organizationAttributions: items.find((i) => i.id === p.id)?.organizationAttributions,
      });
      const sorted = sortItems(projected.canonical.map(toStitched));
      const capped = opts.limit != null ? sorted.slice(0, opts.limit) : sorted;
      const unresolved = sortItems(projected.unresolved.map(toStitched));
      const historicalNeighborhoods = buildHistoricalNeighborhoods(capped, temporalRelations);
      return {
        scope_type: scopeType,
        scope_id: scopeId,
        scope_label: scopeLabel,
        items: attachTemporalProjection(capped, timezone, projectionNow),
        has_user_order: capped.some((i) => i.userSortIndex != null),
        unresolved_items: attachTemporalProjection(unresolved, timezone, projectionNow),
        evidence_hidden_count: projected.evidenceHidden,
        excluded_count: projected.excluded.length,
        historical_neighborhoods: historicalNeighborhoods,
        temporal_relations: temporalRelations,
        narrative_relations: narrativeRelations,
        ...(chapterBackground.length ? { background: sortItems(chapterBackground) } : {}),
        ...(chapter ? { chapter } : {}),
        ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
      };
    }

    const sorted = sortItems(items);
    const capped = opts.limit != null ? sorted.slice(0, opts.limit) : sorted;
    const hasUserOrder = capped.some((i) => i.userSortIndex != null);

    return {
      scope_type: scopeType,
      scope_id: scopeId,
      scope_label: scopeLabel,
      items: attachTemporalProjection(capped, timezone, projectionNow),
      has_user_order: hasUserOrder,
      temporal_relations: temporalRelations,
      narrative_relations: narrativeRelations,
      ...(chapterBackground.length ? { background: sortItems(chapterBackground) } : {}),
      ...(chapter ? { chapter } : {}),
      ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
    };
  }

  async saveUserOrder(
    userId: string,
    input: {
      scope_type: ChronologyScopeType;
      scope_id?: string;
      items: Array<{ kind: StitchedItemKind; id: string; sort_index: number }>;
    }
  ): Promise<{ saved: number }> {
    const scopeId =
      input.scope_type === 'life_arc' && input.scope_id
        ? input.scope_id
        : GLOBAL_SCOPE_ID;

    const rows = input.items.map((item) => ({
      user_id: userId,
      scope_type: input.scope_type,
      scope_id: scopeId,
      item_kind: item.kind,
      item_id: item.id,
      sort_index: item.sort_index,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabaseAdmin
      .from('user_chronology_order')
      .upsert(rows, { onConflict: 'user_id,scope_type,scope_id,item_kind,item_id' });

    if (upsertError) throw upsertError;

    const corrections = input.items.map((item) => ({
      user_id: userId,
      scope_type: input.scope_type,
      scope_id: scopeId,
      item_kind: item.kind,
      item_id: item.id,
      previous_sort_time: null as string | null,
      new_sort_index: item.sort_index,
    }));

    const { error: corrError } = await supabaseAdmin
      .from('chronology_order_corrections')
      .insert(corrections);
    if (corrError) {
      logger.warn({ error: corrError, userId }, 'Failed to log chronology order corrections');
    }

    return { saved: rows.length };
  }

  /**
   * Character-modal seam. Filters the canonical stitched feed by people[].
   */
  async getStitchedTimelineForEntity(
    userId: string,
    entityId: string,
    range?: { start_time?: string; end_time?: string; timezone?: string },
  ): Promise<StitchedTimelineResult> {
    return this.getStitchedTimeline(userId, {
      scope_type: 'global',
      character_id: entityId,
      start_time: range?.start_time,
      end_time: range?.end_time,
      timezone: range?.timezone,
    });
  }

  /**
   * Location-modal seam. Filters the canonical stitched feed by locations[].
   */
  async getStitchedTimelineForLocation(
    userId: string,
    locationId: string,
    range?: { start_time?: string; end_time?: string; timezone?: string },
  ): Promise<StitchedTimelineResult> {
    return this.getStitchedTimeline(userId, {
      scope_type: 'global',
      location_id: locationId,
      start_time: range?.start_time,
      end_time: range?.end_time,
      timezone: range?.timezone,
    });
  }

  /**
   * Organization-modal seam. Filters by canonical organization attributions.
   */
  async getStitchedTimelineForOrganization(
    userId: string,
    organizationId: string,
    range?: { start_time?: string; end_time?: string; timezone?: string },
  ): Promise<StitchedTimelineResult> {
    return this.getStitchedTimeline(userId, {
      scope_type: 'global',
      organization_id: organizationId,
      start_time: range?.start_time,
      end_time: range?.end_time,
      timezone: range?.timezone,
    });
  }
}

export const stitchedTimelineService = new StitchedTimelineService();
