/**
 * Calendar month aggregation — occasions, events, moments by day with attendance.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { stitchedTimelineService } from './stitchedTimelineService';

export type CalendarPresence = 'attended' | 'heard_about' | 'unknown';

export type CalendarDayItem = {
  id: string;
  kind: 'occasion' | 'event' | 'moment';
  title: string;
  sortTime: string;
  userPresence: CalendarPresence;
  temporalRole?: string;
  lifeArcId?: string;
  body?: string;
  sourceKind?: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceId?: string;
  sourceIds?: string[];
  sourceType?: string;
  tags?: string[];
};

export type CalendarOccasion = {
  id: string;
  title: string;
  summary: string | null;
  userPresence: CalendarPresence;
  itemCount: number;
};

export type CalendarDay = {
  date: string;
  occasions: CalendarOccasion[];
  items: CalendarDayItem[];
  attendedCount: number;
  heardAboutCount: number;
  concurrentOccasions: number;
};

export type CalendarMonthResult = {
  year: number;
  month: number;
  days: CalendarDay[];
};

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function presenceFromMeta(meta: Record<string, unknown> | null | undefined): CalendarPresence {
  const p = (meta?.user_presence as string | undefined)?.toLowerCase();
  if (p === 'attended' || p === 'heard_about') return p;
  return 'unknown';
}

export class CalendarAggregationService {
  async getMonth(userId: string, year: number, month: number): Promise<CalendarMonthResult> {
    const { start, end } = monthBounds(year, month);
    const startDay = start.slice(0, 10);
    const endDay = end.slice(0, 10);

    // Calendar is a date projection of the same canonical feed used by the
    // Omni Events, Swimlanes, Story, and search views. This prevents each
    // surface from independently deduplicating or omitting source records.
    const [occasionsRes, stitched, linksRes] = await Promise.all([
      supabaseAdmin
        .from('life_arcs')
        .select('id, title, summary, start_date, metadata, confidence')
        .eq('user_id', userId)
        .eq('arc_type', 'occasion')
        .gte('start_date', startDay)
        .lte('start_date', endDay)
        .gte('confidence', 0.5),
      stitchedTimelineService.getStitchedTimeline(userId, {
        scope_type: 'global',
        start_time: startDay,
        end_time: endDay,
      }),
      supabaseAdmin
        .from('arc_event_links')
        .select('arc_id, resolved_event_id, journal_entry_id, user_presence, temporal_role, sort_time')
        .eq('user_id', userId)
        .gte('sort_time', start)
        .lte('sort_time', end),
    ]);

    if (occasionsRes.error) {
      logger.warn({ error: occasionsRes.error, userId }, 'calendar: occasions load failed');
    }

    const occasions = occasionsRes.data ?? [];
    const links = linksRes.data ?? [];

    const daysMap = new Map<string, CalendarDay>();

    const ensureDay = (date: string): CalendarDay => {
      let d = daysMap.get(date);
      if (!d) {
        d = {
          date,
          occasions: [],
          items: [],
          attendedCount: 0,
          heardAboutCount: 0,
          concurrentOccasions: 0,
        };
        daysMap.set(date, d);
      }
      return d;
    };

    for (const o of occasions) {
      const date = o.start_date ?? startDay;
      const day = ensureDay(date);
      const presence = presenceFromMeta(o.metadata as Record<string, unknown>);
      const linkCount = links.filter(l => l.arc_id === o.id).length;
      day.occasions.push({
        id: o.id,
        title: o.title,
        summary: o.summary,
        userPresence: presence,
        itemCount: linkCount,
      });
      day.concurrentOccasions = day.occasions.length;
      day.items.push({
        id: `occasion:${o.id}`,
        kind: 'occasion',
        title: o.title,
        sortTime: `${date}T12:00:00.000Z`,
        userPresence: presence,
        lifeArcId: o.id,
        body: o.summary ?? undefined,
      });
    }

    for (const item of stitched.items) {
      const link = links.find((candidate) => {
        const linkedId = item.sourceKind === 'journal_entry'
          ? candidate.journal_entry_id
          : item.sourceKind === 'resolved_event'
            ? candidate.resolved_event_id
            : null;
        return Boolean(linkedId && item.sourceIds.includes(linkedId));
      });
      const sortTime = link?.sort_time ?? item.sortTime;
      const date = dayKey(sortTime);
      const day = ensureDay(date);
      const presence = (link?.user_presence as CalendarPresence | undefined)
        ?? item.userPresence
        ?? (item.sourceKind === 'journal_entry' ? 'attended' : 'unknown');
      day.items.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        sortTime,
        userPresence: presence,
        temporalRole: link?.temporal_role ?? item.temporalRole,
        lifeArcId: link?.arc_id ?? undefined,
        body: item.body || undefined,
        sourceKind: item.sourceKind,
        sourceId: item.sourceId,
        sourceIds: item.sourceIds,
        sourceType: item.sourceType,
        tags: item.tags,
      });
      if (presence === 'attended') day.attendedCount++;
      else if (presence === 'heard_about') day.heardAboutCount++;
    }

    for (const day of daysMap.values()) {
      day.items.sort(
        (a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime()
      );
    }

    const days = [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    return { year, month, days };
  }
}

export const calendarAggregationService = new CalendarAggregationService();
