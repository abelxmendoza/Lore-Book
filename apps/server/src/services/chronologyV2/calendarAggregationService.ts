/**
 * Calendar month aggregation — occasions, events, moments by day with attendance.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

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

    const [occasionsRes, eventsRes, momentsRes, linksRes] = await Promise.all([
      supabaseAdmin
        .from('life_arcs')
        .select('id, title, summary, start_date, metadata, confidence')
        .eq('user_id', userId)
        .eq('arc_type', 'occasion')
        .gte('start_date', startDay)
        .lte('start_date', endDay)
        .gte('confidence', 0.5),
      supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, end_time, metadata')
        .eq('user_id', userId)
        .gte('start_time', start)
        .lte('start_time', end)
        .order('start_time', { ascending: true }),
      supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true }),
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
    const events = eventsRes.data ?? [];
    const moments = momentsRes.data ?? [];
    const links = linksRes.data ?? [];

    const linkedEventIds = new Set(
      links.filter(l => l.resolved_event_id).map(l => l.resolved_event_id as string)
    );
    const linkedJournalIds = new Set(
      links.filter(l => l.journal_entry_id).map(l => l.journal_entry_id as string)
    );

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
        id: `occasion-${o.id}`,
        kind: 'occasion',
        title: o.title,
        sortTime: `${date}T12:00:00.000Z`,
        userPresence: presence,
        lifeArcId: o.id,
        body: o.summary ?? undefined,
      });
    }

    for (const e of events) {
      const date = dayKey(e.start_time);
      const day = ensureDay(date);
      const presence = presenceFromMeta(e.metadata as Record<string, unknown>);
      if (linkedEventIds.has(e.id)) continue;
      day.items.push({
        id: `event-${e.id}`,
        kind: 'event',
        title: e.title,
        sortTime: e.start_time,
        userPresence: presence,
        body: e.summary ?? undefined,
      });
      if (presence === 'attended') day.attendedCount++;
      else if (presence === 'heard_about') day.heardAboutCount++;
    }

    for (const m of moments) {
      const sortTime = m.date ?? '';
      if (!sortTime) continue;
      const date = dayKey(sortTime);
      const day = ensureDay(date);
      if (linkedJournalIds.has(m.id)) continue;
      const preview = m.content.replace(/\s+/g, ' ').trim().slice(0, 72);
      day.items.push({
        id: `moment-${m.id}`,
        kind: 'moment',
        title: preview,
        sortTime,
        userPresence: 'attended',
        body: m.content,
      });
    }

    for (const link of links) {
      const date = link.sort_time ? dayKey(link.sort_time) : startDay;
      const day = ensureDay(date);
      const presence = (link.user_presence as CalendarPresence) ?? 'unknown';
      if (link.resolved_event_id) {
        const ev = events.find(e => e.id === link.resolved_event_id);
        if (ev && !day.items.some(i => i.id === `event-${ev.id}`)) {
          day.items.push({
            id: `event-${ev.id}`,
            kind: 'event',
            title: ev.title,
            sortTime: link.sort_time ?? ev.start_time,
            userPresence: presence,
            temporalRole: link.temporal_role ?? undefined,
            lifeArcId: link.arc_id,
            body: ev.summary ?? undefined,
          });
        }
      }
      if (link.journal_entry_id) {
        const je = moments.find(j => j.id === link.journal_entry_id);
        if (je && !day.items.some(i => i.id === `moment-${je.id}`)) {
          const preview = je.content.replace(/\s+/g, ' ').trim().slice(0, 72);
          day.items.push({
            id: `moment-${je.id}`,
            kind: 'moment',
            title: preview,
            sortTime: link.sort_time ?? je.date ?? '',
            userPresence: presence,
            temporalRole: link.temporal_role ?? undefined,
            lifeArcId: link.arc_id,
            body: je.content,
          });
        }
      }
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
