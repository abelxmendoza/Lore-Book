import { fetchJson } from '../lib/api';

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
  unscheduledItems?: CalendarDayItem[];
  historicalNeighborhoods?: Array<{
    id: string;
    label: string;
    start: string;
    end: string;
    precision: 'year';
    tracks: Array<{ id: string; label: string; itemIds: string[] }>;
    relationIds: string[];
  }>;
};

export const calendarMonthApi = {
  get: (year: number, month: number) =>
    fetchJson<CalendarMonthResult>(
      `/api/chronology/calendar?year=${year}&month=${month}`
    ),
};
