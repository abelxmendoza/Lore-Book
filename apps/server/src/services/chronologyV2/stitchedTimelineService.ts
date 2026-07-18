import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { chronologyService } from './chronologyService';
import {
  buildNarrativeAnchor,
  attachAnchorEntityNames,
  classifyCandidate,
  type CohesionCandidate,
} from './narrativeCohesion';
import {
  clusterDuplicateEvents,
  buildMergeLog,
  type MergeLogEntry,
} from './eventCanonicalization';

export type StitchedItemKind = 'moment' | 'event';
export type ChronologyScopeType = 'global' | 'life_arc';

export const GLOBAL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

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
  /** Number of extracted duplicates collapsed into this canonical event. */
  mergedCount?: number;
  /** Titles of the merged-away duplicates (excludes the shown title). */
  mergedTitles?: string[];
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
};

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
}> {
  const { data: arc } = await supabaseAdmin
    .from('life_arcs')
    .select('title, start_date, end_date, arc_type, metadata, summary, tags')
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

export class StitchedTimelineService {
  async getStitchedTimeline(
    userId: string,
    opts: {
      scope_type?: ChronologyScopeType;
      life_arc_id?: string;
      start_time?: string;
      end_time?: string;
    } = {}
  ): Promise<StitchedTimelineResult> {
    const scopeType: ChronologyScopeType =
      opts.scope_type ?? (opts.life_arc_id ? 'life_arc' : 'global');
    const scopeId =
      scopeType === 'life_arc' && opts.life_arc_id ? opts.life_arc_id : GLOBAL_SCOPE_ID;

    let startTime = opts.start_time;
    let endTime = opts.end_time;
    let scopeLabel: string | null = null;
    let arcSummary: string | null = null;
    let arcTags: string[] = [];
    let isOccasionArc = false;
    let isNarrativeConsolidationArc = false;
    let narrativeEventIds: string[] = [];
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
        ((window.metadata?.source_event_ids as string[] | undefined)?.length ?? 0) > 0;
      if (isOccasionArc) {
        occasionLinks = await loadOccasionLinks(userId, opts.life_arc_id);
      } else if (isNarrativeConsolidationArc) {
        narrativeEventIds = await loadNarrativeArcEventIds(userId, opts.life_arc_id, window.metadata);
      }
    }

    const [moments, timelineEventsRes, resolvedEventsRes, orderMap] = await Promise.all([
      chronologyService.getChronologicalOrder(userId, startTime, endTime),
      (async () => {
        let query = supabaseAdmin
          .from('timeline_events')
          .select('id, title, description, event_date, occurred_at, confidence, source_type')
          .eq('user_id', userId);
        if (startTime) query = query.gte('event_date', startTime);
        if (endTime) query = query.lte('event_date', endTime);
        return query.order('event_date', { ascending: true });
      })(),
      (async () => {
        let query = supabaseAdmin
          .from('resolved_events')
          .select('id, title, summary, start_time, confidence, metadata, people, locations, activities, tags')
          .eq('user_id', userId);
        if (startTime) query = query.gte('start_time', `${startTime}T00:00:00.000Z`);
        if (endTime) query = query.lte('start_time', `${endTime}T23:59:59.999Z`);
        return query.order('start_time', { ascending: true });
      })(),
      loadUserOrder(userId, scopeType, scopeId),
    ]);

    const { data: eventRows, error: eventsError } = timelineEventsRes;
    const { data: resolvedRows, error: resolvedError } = resolvedEventsRes;
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
          ? supabaseAdmin.from('journal_entries').select('id, content, date, source, tags').in('id', journalIds)
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
            tags: (m.tags as string[]) ?? [],
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'attended',
            temporalRole: link.temporal_role ?? undefined,
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
        });
        seenEventIds.add(e.id);
      }
    } else {
      const candidatesByKey = new Map<string, CohesionCandidate>();

      for (const m of moments) {
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
      const clusters = clusterDuplicateEvents(
        (resolvedRows ?? []).map((e) => ({
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
        const confidence = Math.max(
          ...cluster.members.map((m) => ((m.row as { confidence?: number }).confidence ?? 1)),
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
            const row = member.row as { tags?: string[] };
            return row.tags ?? [];
          }))],
          confidence,
          userPresence: (meta.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
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

      for (const e of eventRows ?? []) {
        if (seenEventIds.has(e.id)) continue;
        const sortTime = e.event_date ?? e.occurred_at ?? new Date().toISOString();
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
            items: sortedScene,
            has_user_order: sortedScene.some((i) => i.userSortIndex != null),
            background: sortItems(gated.background),
            excluded_count: gated.excludedCount,
            ...(mergeLog?.length ? { merge_log: mergeLog } : {}),
          };
        }
      }
    }

    const sorted = sortItems(items);
    const hasUserOrder = sorted.some((i) => i.userSortIndex != null);

    return {
      scope_type: scopeType,
      scope_id: scopeId,
      scope_label: scopeLabel,
      items: sorted,
      has_user_order: hasUserOrder,
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
}

export const stitchedTimelineService = new StitchedTimelineService();
