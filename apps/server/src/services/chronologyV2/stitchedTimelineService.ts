import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { chronologyService } from './chronologyService';

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
  confidence?: number;
  userPresence?: 'attended' | 'heard_about' | 'unknown';
  temporalRole?: string;
};

export type StitchedTimelineResult = {
  scope_type: ChronologyScopeType;
  scope_id: string;
  scope_label: string | null;
  items: StitchedTimelineItem[];
  has_user_order: boolean;
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
): Promise<{ start?: string; end?: string; label: string | null; arc_type?: string }> {
  const { data: arc } = await supabaseAdmin
    .from('life_arcs')
    .select('title, start_date, end_date, arc_type')
    .eq('user_id', userId)
    .eq('id', lifeArcId)
    .maybeSingle();

  if (!arc) return { label: null };
  return {
    start: arc.start_date ?? undefined,
    end: arc.end_date ?? undefined,
    label: arc.title ?? null,
    arc_type: arc.arc_type ?? undefined,
  };
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
    let isOccasionArc = false;
    let occasionLinks: Awaited<ReturnType<typeof loadOccasionLinks>> = [];

    if (scopeType === 'life_arc' && opts.life_arc_id) {
      const window = await resolveArcWindow(userId, opts.life_arc_id);
      startTime = startTime ?? window.start;
      endTime = endTime ?? window.end;
      scopeLabel = window.label;
      isOccasionArc = window.arc_type === 'occasion';
      if (isOccasionArc) {
        occasionLinks = await loadOccasionLinks(userId, opts.life_arc_id);
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
          .select('id, title, summary, start_time, confidence, metadata')
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
          ? supabaseAdmin.from('resolved_events').select('id, title, summary, start_time, confidence, metadata').in('id', eventIds)
          : Promise.resolve({ data: [] as any[] }),
        journalIds.length
          ? supabaseAdmin.from('journal_entries').select('id, content, date').in('id', journalIds)
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
            userPresence: (link.user_presence as StitchedTimelineItem['userPresence']) ?? 'attended',
            temporalRole: link.temporal_role ?? undefined,
          });
        }
      }
    } else {
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
          confidence: m.time_confidence,
        });
      }

      for (const e of resolvedRows ?? []) {
        const key = `event:${e.id}`;
        seenEventIds.add(e.id);
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        items.push({
          id: key,
          kind: 'event',
          sourceId: e.id,
          sortTime: e.start_time,
          userSortIndex: orderMap.get(key) ?? null,
          title: e.title ?? 'Event',
          body: e.summary ?? '',
          confidence: e.confidence ?? 1,
          userPresence: (meta.user_presence as StitchedTimelineItem['userPresence']) ?? 'unknown',
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
          confidence: e.confidence ?? 1,
        });
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
