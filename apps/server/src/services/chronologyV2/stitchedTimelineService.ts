import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  characterBelongsOnCanonicalEvent,
  locationBelongsOnCanonicalEvent,
} from '../attribution/eventAttributionProjection';
import {
  eventAcceptedForOrganization,
  readOrganizationAttributions,
  type OrganizationAttribution,
} from '../organizations/organizationEventAttribution';

import { chronologyService } from './chronologyService';
import { clusterDuplicateEvents, buildMergeLog, type MergeLogEntry } from './eventCanonicalization';
import {
  buildNarrativeAnchor,
  attachAnchorEntityNames,
  classifyCandidate,
  type CohesionCandidate,
} from './narrativeCohesion';
import { projectCanonicalTimeline } from '../chronologyAuthority/canonicalTimelineProjector';
import type { CanonicalTemporalModel } from '../temporal/canonicalTemporalModel';
import { projectTemporalItem, type TemporalSurfaceProjection } from '../temporal/temporalSurfaceProjection';
import {
  buildHistoricalNeighborhoods,
  type HistoricalNeighborhood,
  type ProjectedNarrativeRelation,
  type ProjectedTemporalRelation,
} from './temporalParallelProjection';

export type StitchedItemKind = 'moment' | 'event';
export type ChronologyScopeType = 'global' | 'life_arc';

export const GLOBAL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

function resolvedEventBelongsToOrganization(row: { metadata?: unknown }, organizationId: string): boolean {
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
  metadata?: Record<string, unknown> | null;
  /** Product-facing related timeline such as career, education, or projects. */
  timelineTrack?: string;
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
  /** Event→organization roles. Presence is not membership. */
  organizationAttributions?: OrganizationAttribution[];
  /** Shared Omni/Calendar projection. Occurrence meaning is fixed here. */
  temporalProjection?: TemporalSurfaceProjection;
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
  /**
   * A source query (resolved_events / timeline_events) failed — e.g. a real
   * schema mismatch or connection error — and this response silently
   * degraded to whatever other sources succeeded. Distinguishes "the query
   * failed" from "the query succeeded and there's genuinely nothing here";
   * callers that need to tell those apart (rather than treat both as an
   * empty/unresolved timeline) should check this before trusting an empty
   * result as authoritative.
   */
  data_errors?: Array<{
    source: 'resolved_events' | 'timeline_events';
    message: string;
  }>;
};

/** Columns that exist on every resolved_events catalog we have seen, including production. */
export const RESOLVED_EVENTS_CORE_SELECT =
  'id, title, summary, start_time, end_time, confidence, metadata, people, locations, activities, created_at';

/**
 * Optional temporal enrichment. Present on the live API (DEFAULT temporal_source =
 * recording_fallback) and absent from some sibling catalogs. Never required to
 * project occurrence — start_time is sufficient.
 */
export const RESOLVED_EVENTS_OPTIONAL_TEMPORAL_SELECT =
  'tags, temporal_precision, temporal_source, temporal_status, temporal_confidence, temporal_expression';

export const RESOLVED_EVENTS_SELECT = `${RESOLVED_EVENTS_CORE_SELECT}, ${RESOLVED_EVENTS_OPTIONAL_TEMPORAL_SELECT}`;

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  return code === 'PGRST204' || code === '42703' || /could not find the .+ column/i.test(message);
}

/** Coerce a resolved_events.start_time value to a non-empty ISO string. */
export function canonicalStartTime(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function metadataMarksOccurrenceUnresolved(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  const temporal = (meta as Record<string, unknown>).temporal;
  if (!temporal || typeof temporal !== 'object') return false;
  const occurred = (temporal as Record<string, unknown>).occurred;
  if (!occurred || typeof occurred !== 'object') return false;
  return (occurred as Record<string, unknown>).status === 'unanchored';
}

/**
 * Occurrence for a resolved_events row. start_time is sufficient unless metadata
 * explicitly marks the occurrence unanchored. created_at / sortTime never fill this.
 */
export function resolvedOccurrenceStart(row: { start_time?: unknown; metadata?: unknown }): string | null {
  if (metadataMarksOccurrenceUnresolved(row.metadata)) return null;
  return canonicalStartTime(row.start_time);
}

/**
 * Live schema defaults temporal_source to 'recording_fallback' whenever ingestion
 * set start_time without classifying evidence. That default is not a veto.
 */
export function resolvedTemporalSource(row: {
  temporal_source?: unknown;
  start_time?: unknown;
  metadata?: unknown;
}): string {
  const start = resolvedOccurrenceStart(row);
  const src = typeof row.temporal_source === 'string' ? row.temporal_source : '';
  if (src && src !== 'recording_fallback') return src;
  return start ? 'context_inferred' : 'recording_fallback';
}

async function fetchResolvedEvents(
  apply: (query: any) => PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message?: string } | null;
  }>,
  context: { userId: string; path: string }
): Promise<{ rows: any[]; queryFailed: boolean; errorMessage?: string }> {
  const run = (select: string) => apply(supabaseAdmin.from('resolved_events').select(select));
  let { data, error } = await run(RESOLVED_EVENTS_SELECT);
  if (error && isMissingColumnError(error)) {
    logger.error(
      {
        code: error.code,
        message: error.message,
        userId: context.userId,
        path: context.path,
      },
      'resolved_events schema drift: optional temporal columns missing from SELECT; retrying core occurrence fields'
    );
    ({ data, error } = await run(RESOLVED_EVENTS_CORE_SELECT));
  }
  if (error) {
    logger.error(
      { error, userId: context.userId, path: context.path },
      'resolved_events query failed for stitch — not converting to unresolved occurrence'
    );
    return {
      rows: [],
      queryFailed: true,
      errorMessage: error.message ?? String(error),
    };
  }
  return { rows: data ?? [], queryFailed: false };
}

async function loadTemporalRelations(userId: string): Promise<ProjectedTemporalRelation[]> {
  const { data, error } = await supabaseAdmin
    .from('canonical_temporal_relations')
    .select(
      'id, source_ref_id, source_label, target_ref_id, target_label, relation_type, confidence, evidence_phrase, source_message_id, source_assertion_ids'
    )
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
      'CONSIDERED_BEGINNING_OF',
      'TURNING_POINT_IN',
      'END_OF_CHAPTER',
      'DEFINING_PERIOD_OF',
      'RETURN_TO',
      'RESTART_OF',
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
    return [...items].sort((a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime());
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
  endDate: string | null = null
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
  fallback: NarrativeChapterData | undefined
): Promise<NarrativeChapterData | undefined> {
  const { data, error } = await supabaseAdmin
    .from('narrative_chapters')
    .select(
      'title, thesis, dominant_theme, start_date, end_date, participant_ids, location_ids, supporting_event_ids, background_event_ids, background_context, outcomes, contribution_scores, quality, confidence'
    )
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
  candidatesByKey: Map<string, CohesionCandidate>
): Promise<{
  scene: StitchedTimelineItem[];
  background: StitchedTimelineItem[];
  excludedCount: number;
} | null> {
  const anchor = buildNarrativeAnchor(seed, [...candidatesByKey.values()]);
  if (!anchor) return null;

  // Resolve display names for anchor entities so text-only moments that
  // mention them by name ("went shopping with …") still match.
  const peopleIds = [...anchor.peopleIds];
  const locationIds = [...anchor.locationIds];
  const [charsRes, locsRes] = await Promise.all([
    peopleIds.length
      ? supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).in('id', peopleIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null }>,
        }),
    locationIds.length
      ? supabaseAdmin.from('locations').select('id, name').eq('user_id', userId).in('id', locationIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null }>,
        }),
  ]);
  attachAnchorEntityNames(
    anchor,
    (charsRes.data ?? []).map((c) => c.name ?? '').filter(Boolean),
    (locsRes.data ?? []).map((l) => l.name ?? '').filter(Boolean)
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

/**
 * The one shared temporal-authority seam every scope routes through — same
 * projectCanonicalTimeline call, same dedup/eligibility/unresolved-bucketing,
 * regardless of whether the caller asked for global, an occasion arc, a
 * narrative-consolidation arc, or a plain life_arc window. Scope-specific
 * code selects WHICH raw candidates enter this function (a legitimate
 * filter-then-project); nothing downstream of this function may invent its
 * own occurrence value. See Phase 8 of the scoped-stitched-timeline task:
 * "load canonical candidates → CanonicalTemporalModel → canonical timeline
 * projection → apply scope filter → surface projection."
 */
function projectStitchedItems(items: StitchedTimelineItem[]): {
  canonical: StitchedTimelineItem[];
  unresolved: StitchedTimelineItem[];
  evidenceHidden: number;
  excludedCount: number;
} {
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
      metadata: item.metadata,
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
    }))
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const toStitched = (p: (typeof projected.canonical)[number]): StitchedTimelineItem => {
    const original = byId.get(p.id);
    return {
      id: p.id,
      kind: p.kind,
      sourceId: p.sourceId,
      sortTime: p.sortTime,
      userSortIndex: original?.userSortIndex ?? null,
      title: p.title,
      body: p.body,
      sourceKind: p.sourceKind,
      sourceIds: p.sourceIds,
      sourceType: p.sourceType,
      metadata: p.metadata,
      timelineTrack: original?.timelineTrack,
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
      userPresence: original?.userPresence,
      temporalRole: original?.temporalRole,
      mergedCount: original?.mergedCount,
      mergedTitles: original?.mergedTitles,
    };
  };
  return {
    canonical: projected.canonical.map(toStitched),
    unresolved: projected.unresolved.map(toStitched),
    evidenceHidden: projected.evidenceHidden,
    excludedCount: projected.excluded.length,
  };
}

async function loadNarrativeArcEventIds(
  userId: string,
  arcId: string,
  metadata?: Record<string, unknown>
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

function attachTemporalProjection(items: StitchedTimelineItem[], timezone: string, now: Date): StitchedTimelineItem[] {
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
       * Restrict the global scope to events with a grounded association to this
       * character. Canonical entityAttributions win over compatibility people[].
       * Journal moments and timeline_events carry no character linkage today,
       * so they're excluded rather than guessed at.
       */
      character_id?: string;
      /**
       * Restrict the global scope to events at this location (matched against
       * resolved_events.locations / canonical place attribution).
       */
      location_id?: string;
      /**
       * Restrict the global scope to events attributed to this organization
       * (canonical IDs in metadata.organizationAttributions). Not name search
       * or member overlap.
       */
      organization_id?: string;
      /**
       * Cap the final item count after sorting/clustering (applied last, so a
       * cap never discards dedup accuracy). Undefined = unbounded, matching
       * every existing caller's behavior; callers issuing this per request
       * (e.g. a chat turn) should pass an explicit cap to keep it cheap.
       */
      limit?: number;
      /** IANA timezone for shared Omni/Calendar projection. Defaults to UTC. */
      timezone?: string;
    } = {}
  ): Promise<StitchedTimelineResult> {
    const scopeType: ChronologyScopeType = opts.scope_type ?? (opts.life_arc_id ? 'life_arc' : 'global');
    const scopeId = scopeType === 'life_arc' && opts.life_arc_id ? opts.life_arc_id : GLOBAL_SCOPE_ID;
    const timezone = opts.timezone ?? 'UTC';
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
          window.end ?? null
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

    const [moments, timelineEventsRes, resolvedEventsRes, orderMap, temporalRelations, narrativeRelations] =
      await Promise.all([
        chronologyService.getChronologicalOrder(userId, startTime, endTime, undefined, {
          includeReviewPending: true,
        }),
        (async () => {
          let query = supabaseAdmin
            .from('timeline_events')
            .select('id, title, description, event_date, occurred_at, confidence, source_type, created_at, metadata')
            .eq('user_id', userId);
          if (startTime) query = query.gte('event_date', startTime);
          if (endTime) query = query.lte('event_date', endTime);
          return query.order('event_date', { ascending: true });
        })(),
        fetchResolvedEvents(
          (query) => {
            query = query.eq('user_id', userId);
            if (startTime) {
              const lowerBound = `${startTime}T00:00:00.000Z`;
              query = query.or(`start_time.gte.${lowerBound},end_time.gte.${lowerBound}`);
            }
            if (endTime) query = query.lte('start_time', `${endTime}T23:59:59.999Z`);
            return query.order('start_time', {
              ascending: true,
              nullsFirst: false,
            });
          },
          { userId, path: 'stitched.global' }
        ),
        loadUserOrder(userId, scopeType, scopeId),
        loadTemporalRelations(userId),
        loadNarrativeRelations(userId),
      ]);

    const { data: eventRows, error: eventsError } = timelineEventsRes;
    const resolvedRows = resolvedEventsRes.rows;
    const dataErrors: NonNullable<StitchedTimelineResult['data_errors']> = [];
    if (eventsError) {
      logger.error({ error: eventsError, userId }, 'Failed to load timeline events for stitch');
      dataErrors.push({
        source: 'timeline_events',
        message: eventsError.message ?? String(eventsError),
      });
    }
    if (resolvedEventsRes.queryFailed) {
      dataErrors.push({
        source: 'resolved_events',
        message: resolvedEventsRes.errorMessage ?? 'resolved_events query failed',
      });
    }

    const items: StitchedTimelineItem[] = [];
    const seenEventIds = new Set<string>();

    if (isOccasionArc && occasionLinks.length > 0) {
      const eventIds = occasionLinks.filter((l) => l.resolved_event_id).map((l) => l.resolved_event_id!);
      const journalIds = occasionLinks.filter((l) => l.journal_entry_id).map((l) => l.journal_entry_id!);

      const [linkedEvents, linkedJournal] = await Promise.all([
        eventIds.length
          ? fetchResolvedEvents((query) => query.in('id', eventIds), {
              userId,
              path: 'stitched.occasion',
            })
          : Promise.resolve({ rows: [] as any[], queryFailed: false }),
        journalIds.length
          ? supabaseAdmin
              .from('journal_entries')
            .select('id, content, date, source, tags, time_precision, time_confidence, created_at, metadata')
              .in('id', journalIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (linkedEvents.queryFailed) {
        dataErrors.push({
          source: 'resolved_events',
          message: 'occasion resolved_events query failed',
        });
      }

      // arc_event_links.sort_time is container/order metadata for this
      // occasion — where the item falls WITHIN the arc's own internal
      // sequence — not occurrence evidence. It's kept below only as
      // `sortTime`, a pre-projection convenience the canonical projector
      // replaces outright (see projectStitchedItems); occurredAt/
      // temporalSource always come from the underlying event/journal row's
      // own real evidence, never from the link.
      for (const link of occasionLinks) {
        if (link.resolved_event_id) {
          const e = linkedEvents.rows.find((r) => r.id === link.resolved_event_id);
          if (!e) continue;
          const key = `event:${e.id}`;
          const meta = (e.metadata ?? {}) as Record<string, unknown>;
          const temporalMeta = (meta.temporal ?? {}) as Record<string, unknown>;
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
            sourceType: (meta.source_type as string | undefined) ?? 'resolved_event',
            metadata: meta,
            timelineTrack: meta.timeline_track as string | undefined,
            tags: (e.tags as string[]) ?? [],
            confidence: e.confidence ?? 1,
            timePrecision: (e.temporal_precision as string) ?? 'date',
            timeConfidence: Number(e.temporal_confidence ?? e.confidence ?? 1),
            // See the general-sweep dated-resolved cluster construction below
            // for why a real start_time overrides the 'recording_fallback'
            // schema default here too — same table, same semantics.
            temporalSource: resolvedTemporalSource(e),
            occurredAt: resolvedOccurrenceStart(e),
            mentionedAt: (temporalMeta.mentioned_at as string | undefined) ?? null,
            recordedAt: (e.created_at as string | null) ?? null,
            knownFrom: (temporalMeta.known_from as string | undefined) ?? (e.created_at as string | null) ?? null,
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
            temporalRole: link.temporal_role ?? undefined,
          });
          seenEventIds.add(e.id);
        }
        if (link.journal_entry_id) {
          const m = (linkedJournal.data ?? []).find((j) => j.id === link.journal_entry_id);
          if (!m) continue;
          const sourceId = m.id;
          const key = `moment:${sourceId}`;
          const timeConfidence = typeof m.time_confidence === 'number' ? m.time_confidence : 1.0;
          items.push({
            id: key,
            kind: 'moment',
            sourceId,
            sortTime: link.sort_time ?? m.date ?? new Date().toISOString(),
            userSortIndex: orderMap.get(key) ?? null,
            title: momentTitle(m.content),
            body: m.content,
            sourceKind: 'journal_entry',
            sourceIds: [sourceId],
            sourceType: m.source ?? 'manual',
            metadata: (m.metadata as Record<string, unknown> | null) ?? null,
            tags: (m.tags as string[]) ?? [],
            timePrecision: (m.time_precision as string) ?? 'exact',
            timeConfidence,
            // Same rule as the general sweep's moment handling: a low-confidence
            // (write-time-fallback) date carries no occurrence claim at all.
            temporalSource: timeConfidence < 0.3 ? 'recording_fallback' : 'user_stated',
            occurredAt: timeConfidence < 0.3 ? null : (m.date ?? null),
            recordedAt: (m.created_at as string | null) ?? null,
            knownFrom: (m.created_at as string | null) ?? null,
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'attended',
            temporalRole: link.temporal_role ?? undefined,
          });
        }
      }
    } else if (isNarrativeConsolidationArc && narrativeEventIds.length > 0) {
      const linked = await fetchResolvedEvents((query) => query.eq('user_id', userId).in('id', narrativeEventIds), {
        userId,
        path: 'stitched.narrative',
      });
      if (linked.queryFailed) {
        dataErrors.push({
          source: 'resolved_events',
          message: linked.errorMessage ?? 'narrative resolved_events query failed',
        });
      }

      for (const e of linked.rows) {
        const key = `event:${e.id}`;
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        const narrative = (meta.narrative_structure ?? {}) as Record<string, unknown>;
        const primaryRole = narrative.primary_arc_membership_role as string | undefined;
        const temporalMeta = (meta.temporal ?? {}) as Record<string, unknown>;
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
          metadata: meta,
          timelineTrack: meta.timeline_track as string | undefined,
          tags: (e.tags as string[]) ?? [],
          confidence: e.confidence ?? 1,
          timePrecision: (e.temporal_precision as string) ?? 'date',
          timeConfidence: Number(e.temporal_confidence ?? e.confidence ?? 1),
          temporalSource: resolvedTemporalSource(e),
          occurredAt: resolvedOccurrenceStart(e),
          mentionedAt: (temporalMeta.mentioned_at as string | undefined) ?? null,
          recordedAt: (e.created_at as string | null) ?? null,
          knownFrom: (temporalMeta.known_from as string | undefined) ?? (e.created_at as string | null) ?? null,
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
          metadata: (event.metadata as Record<string, unknown> | null) ?? null,
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
          metadata: m.metadata ?? null,
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
      let characterName: string | undefined;
      if (characterId) {
        const { data: characterRow } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('user_id', userId)
          .eq('id', characterId)
          .maybeSingle();
        characterName = (characterRow?.name as string | undefined) ?? undefined;
      }
      const associationView = (e: Record<string, unknown>) => ({
        id: e.id as string,
        title: (e.title as string | null) ?? null,
        summary: (e.summary as string | null) ?? null,
        people: (e.people as string[] | null) ?? [],
        locations: (e.locations as string[] | null) ?? [],
        metadata: (e.metadata as Record<string, unknown> | null) ?? {},
      });
      const scopedResolvedRows = characterId
        ? (resolvedRows ?? []).filter(
            (e) =>
              characterBelongsOnCanonicalEvent(associationView(e), {
                id: characterId,
                name: characterName,
              }).associated
          )
        : locationId
          ? (resolvedRows ?? []).filter(
              (e) =>
                locationBelongsOnCanonicalEvent(associationView(e), {
                  id: locationId,
                }).associated
            )
          : organizationId
            ? (resolvedRows ?? []).filter((e) => resolvedEventBelongsToOrganization(e, organizationId))
            : (resolvedRows ?? []);
      const datedResolved = scopedResolvedRows.filter((e) => resolvedOccurrenceStart(e) != null);
      const undatedResolved = scopedResolvedRows.filter((e) => resolvedOccurrenceStart(e) == null);
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
          timelineTrack: meta.timeline_track as string | undefined,
          tags: (e.tags as string[]) ?? [],
          confidence: Number(e.temporal_confidence ?? e.confidence ?? 0.2),
          timePrecision: (e.temporal_precision as string) ?? 'unknown',
          timeConfidence: Number(e.temporal_confidence ?? 0.2),
          temporalSource: resolvedTemporalSource(e),
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
          time: resolvedOccurrenceStart(e) as string,
          peopleIds: (e.people as string[]) ?? [],
          locationIds: (e.locations as string[]) ?? [],
          activityIds: (e.activities as string[]) ?? [],
          row: e,
        }))
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
            const r = m.row as {
              temporal_confidence?: number;
              confidence?: number;
            };
            return r.temporal_confidence ?? r.confidence ?? 1;
          })
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
          metadata: meta,
          timelineTrack: meta.timeline_track as string | undefined,
          tags: [
            ...new Set(
              cluster.members.flatMap((member) => {
                const memberRow = member.row as { tags?: string[] };
                return memberRow.tags ?? [];
              })
            ),
          ],
          confidence,
          timePrecision: row.temporal_precision ?? 'date',
          timeConfidence: row.temporal_confidence ?? confidence,
          temporalSource: resolvedTemporalSource({
            ...row,
            start_time: cluster.time,
            metadata: meta,
          }),
          occurredAt: cluster.time,
          occurredEnd: (canonical.row as { end_time?: string | null }).end_time ?? null,
          mentionedAt: (temporalMeta.mentioned_at as string | undefined) ?? null,
          recordedAt: row.created_at ?? null,
          knownFrom: (temporalMeta.known_from as string | undefined) ?? row.created_at ?? null,
          validFrom: (temporalMeta.valid_from as string | undefined) ?? null,
          validUntil: (temporalMeta.valid_until as string | undefined) ?? null,
          userPresence: (meta.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
          organizationAttributions: cluster.members.flatMap((member) =>
            attributionsFromResolvedRow(member.row as { metadata?: unknown })
          ),
          ...(cluster.members.length > 1
            ? {
                mergedCount: cluster.members.length,
                mergedTitles: cluster.mergedTitles,
              }
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

      for (const e of characterId ? [] : (eventRows ?? [])) {
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
          metadata: e.metadata ?? null,
          confidence: e.confidence ?? 1,
          occurredAt,
          recordedAt: e.created_at ?? null,
          knownFrom: e.created_at ?? null,
          temporalSource: occurredAt ? 'user_stated' : 'recording_fallback',
          timePrecision: occurredAt ? 'date' : 'unknown',
          timeConfidence: occurredAt ? (e.confidence ?? 0.8) : 0,
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
      // Cohesion is a scope FILTER (which items belong to this arc's story),
      // so it runs on top of the canonical projection, not instead of it —
      // the arc must not see a different occurrence for the same event than
      // global would. Unresolved items are never cohesion-gated (there's no
      // reliable date to judge topical proximity against) and are always
      // preserved as their own tray, same as global.
      if (scopeType === 'life_arc' && scopeLabel) {
        const { canonical, unresolved, evidenceHidden } = projectStitchedItems(items);
        const gated = await applyCohesionGate(
          userId,
          { title: scopeLabel, summary: arcSummary, tags: arcTags },
          canonical,
          candidatesByKey
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
            unresolved_items: attachTemporalProjection(sortItems(unresolved), timezone, projectionNow),
            evidence_hidden_count: evidenceHidden,
            excluded_count: gated.excludedCount,
            ...(chapter ? { chapter } : {}),
            ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
            ...(dataErrors.length ? { data_errors: dataErrors } : {}),
          };
        }
      }
    }

    // Every remaining path — global, and any life_arc path that didn't
    // already return via the cohesion gate above (plain date-window arcs
    // with no anchor, occasion arcs, narrative-consolidation arcs) — shares
    // the same canonical projection. Scope is exhausted at this point (the
    // candidate set was already narrowed to this scope's raw rows above);
    // what happens here is purely "what does the canonical model say about
    // these candidates," identical regardless of scope_type.
    {
      const { canonical, unresolved, evidenceHidden, excludedCount } = projectStitchedItems(items);
      const sorted = sortItems(canonical);
      const capped = opts.limit != null ? sorted.slice(0, opts.limit) : sorted;
      const unresolvedSorted = sortItems(unresolved);
      const historicalNeighborhoods =
        scopeType === 'global' ? buildHistoricalNeighborhoods(capped, temporalRelations) : undefined;
      return {
        scope_type: scopeType,
        scope_id: scopeId,
        scope_label: scopeLabel,
        items: attachTemporalProjection(capped, timezone, projectionNow),
        has_user_order: capped.some((i) => i.userSortIndex != null),
        unresolved_items: attachTemporalProjection(unresolvedSorted, timezone, projectionNow),
        evidence_hidden_count: evidenceHidden,
        excluded_count: excludedCount,
        ...(historicalNeighborhoods ? { historical_neighborhoods: historicalNeighborhoods } : {}),
        temporal_relations: temporalRelations,
        narrative_relations: narrativeRelations,
        ...(chapterBackground.length
          ? {
              background: attachTemporalProjection(sortItems(chapterBackground), timezone, projectionNow),
            }
          : {}),
        ...(chapter ? { chapter } : {}),
        ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
        ...(dataErrors.length ? { data_errors: dataErrors } : {}),
      };
    }
  }

  async saveUserOrder(
    userId: string,
    input: {
      scope_type: ChronologyScopeType;
      scope_id?: string;
      items: Array<{ kind: StitchedItemKind; id: string; sort_index: number }>;
    }
  ): Promise<{ saved: number }> {
    const scopeId = input.scope_type === 'life_arc' && input.scope_id ? input.scope_id : GLOBAL_SCOPE_ID;

    const rows = input.items.map((item) => ({
      user_id: userId,
      scope_type: input.scope_type,
      scope_id: scopeId,
      item_kind: item.kind,
      item_id: item.id,
      sort_index: item.sort_index,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabaseAdmin.from('user_chronology_order').upsert(rows, {
      onConflict: 'user_id,scope_type,scope_id,item_kind,item_id',
    });

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

    const { error: corrError } = await supabaseAdmin.from('chronology_order_corrections').insert(corrections);
    if (corrError) {
      logger.warn({ error: corrError, userId }, 'Failed to log chronology order corrections');
    }

    return { saved: rows.length };
  }

  /**
   * Location-modal seam. Filters the canonical stitched feed by location association.
   */
  async getStitchedTimelineForLocation(
    userId: string,
    locationId: string,
    range?: { start_time?: string; end_time?: string; timezone?: string }
  ): Promise<StitchedTimelineResult> {
    return this.getStitchedTimeline(userId, {
      scope_type: 'global',
      location_id: locationId,
      start_time: range?.start_time,
      end_time: range?.end_time,
    });
  }

  /**
   * Organization-modal seam. Filters by canonical organization attributions.
   */
  async getStitchedTimelineForOrganization(
    userId: string,
    organizationId: string,
    range?: { start_time?: string; end_time?: string; timezone?: string }
  ): Promise<StitchedTimelineResult> {
    return this.getStitchedTimeline(userId, {
      scope_type: 'global',
      organization_id: organizationId,
      start_time: range?.start_time,
      end_time: range?.end_time,
    });
  }
}

export const stitchedTimelineService = new StitchedTimelineService();
