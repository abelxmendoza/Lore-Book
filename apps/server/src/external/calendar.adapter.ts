import { ExternalEvent } from './types';

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  attendees?: string[];
};

type CalendarPayload = { events: CalendarEvent[] };

export function calendarAdapter(payload: CalendarPayload): ExternalEvent[] {
  return (payload.events ?? []).map((event) => ({
    source: 'calendar' as const,
    timestamp: event.start,
    type: 'event',
    text: event.description ?? event.title,
    tags: ['meeting'],
    characters: event.attendees,
  }));
}
