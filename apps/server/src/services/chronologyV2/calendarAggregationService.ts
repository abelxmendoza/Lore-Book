/**
 * Calendar month aggregation — occasions, events, moments by day with attendance.
 * Occurrence placement uses the shared temporal surface projection; sort_time
 * remains ordering metadata.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  projectTemporalItem,
  projectionOverlapsLocalMonth,
  type TemporalSurfaceProjection,
} from '../temporal/temporalSurfaceProjection';
import {
  civilDateKey,
  resolveProjectionTimezone,
} from '../temporal/userLocalTime';
import { stitchedTimelineService, type StitchedTimelineItem } from './stitchedTimelineService';
import type { HistoricalNeighborhood } from './temporalParallelProjection';

export type CalendarPresence = 'attended' | 'heard_about' | 'unknown';

export type CalendarDayItem = {
  id: string;
  canonicalItemId?: string;
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
  canonicalEventType?: string;
  occurredStart?: string | null;
  occurredEnd?: string | null;
  userLocalStartDay?: string | null;
  userLocalEndDay?: string | null;
  timezone?: string | null;
  precision?: string;
  occurrenceStatus?: string;
  temporalState?: string;
  isRange?: boolean;
  isAllDay?: boolean;
  isTimed?: boolean;
  isUnresolved?: boolean;
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
  timezone?: string;
  days: CalendarDay[];
  /** Same unresolved source as Omni; not assigned a fabricated day. */
  unscheduledItems?: CalendarDayItem[];
  /** Fuzzy/year-scale ranges are lanes, never fake day cards. */
  historicalNeighborhoods?: HistoricalNeighborhood[];
};

type OccasionRow = {
  id: string;
  title: string;
  summary: string | null;
  start_date: string | null;
  metadata: Record<string, unknown> | null;
};

type ArcEventLink = {
  arc_id: string;
  resolved_event_id: string | null;
  journal_entry_id: string | null;
  user_presence: string | null;
  temporal_role: string | null;
  sort_time: string | null;
};

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function presenceFromMeta(meta: Record<string, unknown> | null | undefined): CalendarPresence {
  const p = (meta?.user_presence as string | undefined)?.toLowerCase();
  if (p === 'attended' || p === 'heard_about') return p;
  return 'unknown';
}

function findLink(item: StitchedTimelineItem, links: ArcEventLink[]): ArcEventLink | undefined {
  return links.find((candidate) => {
    const linkedId = item.sourceKind === 'journal_entry'
      ? candidate.journal_entry_id
      : item.sourceKind === 'resolved_event'
        ? candidate.resolved_event_id
        : null;
    return Boolean(linkedId && item.sourceIds.includes(linkedId));
  });
}

function toCalendarItem(
  item: StitchedTimelineItem,
  projection: TemporalSurfaceProjection,
  link: ArcEventLink | undefined,
): CalendarDayItem {
  const presence = (link?.user_presence as CalendarPresence | undefined)
    ?? item.userPresence
    ?? (item.sourceKind === 'journal_entry' ? 'attended' : 'unknown');
  return {
    id: item.id,
    canonicalItemId: projection.canonicalItemId,
    kind: item.kind,
    title: item.title,
    sortTime: link?.sort_time || item.sortTime,
    userPresence: presence,
    temporalRole: link?.temporal_role ?? item.temporalRole,
    lifeArcId: link?.arc_id ?? undefined,
    body: item.body || undefined,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    sourceIds: item.sourceIds,
    sourceType: item.sourceType,
    tags: item.tags,
    canonicalEventType: item.canonicalEventType,
    occurredStart: projection.occurredStart,
    occurredEnd: projection.occurredEnd,
    userLocalStartDay: projection.userLocalStartDay,
    userLocalEndDay: projection.userLocalEndDay,
    timezone: projection.timezone,
    precision: projection.precision,
    occurrenceStatus: projection.occurrenceStatus,
    temporalState: projection.temporalState,
    isRange: projection.isRange,
    isAllDay: projection.isAllDay,
    isTimed: projection.isTimed,
    isUnresolved: projection.isUnresolved,
  };
}

function placementDay(
  projection: TemporalSurfaceProjection,
  year: number,
  month: number,
): string {
  const monthStart = civilDateKey(year, month, 1);
  const start = projection.userLocalStartDay ?? monthStart;
  return start < monthStart ? monthStart : start;
}

export function buildCalendarMonthFromStitched(input: {
  year: number;
  month: number;
  timezone: string;
  now?: Date;
  stitchedItems: StitchedTimelineItem[];
  unresolvedItems?: StitchedTimelineItem[];
  occasions?: OccasionRow[];
  links?: ArcEventLink[];
  historicalNeighborhoods?: HistoricalNeighborhood[];
}): CalendarMonthResult {
  const timezone = resolveProjectionTimezone(input.timezone);
  const now = input.now ?? new Date();
  const links = input.links ?? [];
  const seen = new Set<string>();
  const daysMap = new Map<string, CalendarDay>();
  const unscheduledItems: CalendarDayItem[] = [];

  const ensureDay = (date: string): CalendarDay => {
    let day = daysMap.get(date);
    if (!day) {
      day = {
        date,
        occasions: [],
        items: [],
        attendedCount: 0,
        heardAboutCount: 0,
        concurrentOccasions: 0,
      };
      daysMap.set(date, day);
    }
    return day;
  };

  for (const occasion of input.occasions ?? []) {
    const date = occasion.start_date;
    if (!date) continue;
    const day = ensureDay(date);
    const presence = presenceFromMeta(occasion.metadata);
    const linkCount = links.filter((link) => link.arc_id === occasion.id).length;
    day.occasions.push({
      id: occasion.id,
      title: occasion.title,
      summary: occasion.summary,
      userPresence: presence,
      itemCount: linkCount,
    });
    day.concurrentOccasions = day.occasions.length;
    day.items.push({
      id: `occasion:${occasion.id}`,
      canonicalItemId: occasion.id,
      kind: 'occasion',
      title: occasion.title,
      sortTime: `${date}T12:00:00.000Z`,
      userPresence: presence,
      lifeArcId: occasion.id,
      body: occasion.summary ?? undefined,
      userLocalStartDay: date,
      userLocalEndDay: date,
      precision: 'date',
      occurrenceStatus: 'confirmed',
      temporalState: 'past',
      isAllDay: true,
      isTimed: false,
      isRange: false,
      isUnresolved: false,
    });
  }

  const place = (row: StitchedTimelineItem) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const projection = projectTemporalItem(row, timezone, now, 'calendar');
    const link = findLink(row, links);
    const calendarItem = toCalendarItem(row, projection, link);
    const unscheduled = projection.calendarPlacement === 'unscheduled' || projection.isUnresolved;
    if (unscheduled) {
      unscheduledItems.push(calendarItem);
      return;
    }
    if (!projectionOverlapsLocalMonth(projection, input.year, input.month)) return;
    const date = placementDay(projection, input.year, input.month);
    const day = ensureDay(date);
    day.items.push(calendarItem);
    if (calendarItem.userPresence === 'attended') day.attendedCount += 1;
    else if (calendarItem.userPresence === 'heard_about') day.heardAboutCount += 1;
  };

  for (const row of input.stitchedItems) place(row);
  for (const row of input.unresolvedItems ?? []) place(row);

  for (const day of daysMap.values()) {
    day.items.sort((a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime());
  }

  return {
    year: input.year,
    month: input.month,
    timezone,
    days: [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    unscheduledItems,
    historicalNeighborhoods: input.historicalNeighborhoods,
  };
}

export class CalendarAggregationService {
  async getMonth(
    userId: string,
    year: number,
    month: number,
    timezone?: string,
  ): Promise<CalendarMonthResult> {
    const { start, end } = monthBounds(year, month);
    const startDay = start.slice(0, 10);
    const endDay = end.slice(0, 10);
    const tz = resolveProjectionTimezone(timezone);

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
        timezone: tz,
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

    return buildCalendarMonthFromStitched({
      year,
      month,
      timezone: tz,
      stitchedItems: stitched.items,
      unresolvedItems: stitched.unresolved_items,
      occasions: (occasionsRes.data ?? []) as OccasionRow[],
      links: (linksRes.data ?? []) as ArcEventLink[],
      historicalNeighborhoods: stitched.historical_neighborhoods?.filter(
        (neighborhood) => neighborhood.label === String(year),
      ),
    });
  }
}

export const calendarAggregationService = new CalendarAggregationService();
