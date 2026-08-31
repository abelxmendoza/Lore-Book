import { fetchJson } from '../lib/api';

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
  timelineTrack?: string;
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
