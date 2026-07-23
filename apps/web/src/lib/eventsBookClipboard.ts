import type { Event } from '../components/events/EventProfileCard';
import { formatEventTime } from './formatEventTime';
import { buildListClipboardText } from './listClipboard';
import { getDisplayTitle } from '../utils/displayTitle';

export function buildEventsBookClipboardText(events: Event[]): string {
  return buildListClipboardText({
    title: 'Life Log / Moments',
    items: events.map((event) => ({
      heading: getDisplayTitle({
        title: event.title,
        summary: event.summary,
        people: event.people,
        locations: event.locations,
        fallbackNoun: 'Moment',
      }),
      fields: [
        { label: 'Id', value: event.id },
        { label: 'Type', value: event.type },
        { label: 'When', value: formatEventTime(event) },
        { label: 'Start', value: event.start_time },
        { label: 'End', value: event.end_time },
        { label: 'Confidence', value: Math.round(event.confidence * 100) / 100 },
        { label: 'People', value: event.people.slice(0, 12) },
        { label: 'Locations', value: event.locations.slice(0, 12) },
        { label: 'Activities', value: event.activities.slice(0, 12) },
        { label: 'Sources', value: event.source_count },
        { label: 'Impact', value: event.impact?.type },
        { label: 'Impact person', value: event.impact?.connectionCharacter },
        { label: 'Emotional impact', value: event.impact?.emotionalImpact },
        { label: 'Created', value: event.created_at },
        { label: 'Updated', value: event.updated_at },
      ],
      body: event.summary ?? undefined,
    })),
  });
}
