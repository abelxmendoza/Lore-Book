import { buildListClipboardText } from './listClipboard';
import type { LocationProfile } from '../components/locations/LocationProfileCard';

export function buildLocationBookClipboardText(locations: LocationProfile[]): string {
  return buildListClipboardText({
    title: 'Places / Locations',
    items: locations.map((loc) => {
      const people = (loc.relatedPeople ?? [])
        .map((p) => p.name)
        .filter(Boolean)
        .slice(0, 12);
      const tags = [
        ...(loc.tagCounts ?? []).map((t) => t.tag),
        ...(Array.isArray(loc.metadata?.aliases) ? (loc.metadata!.aliases as string[]) : []),
      ].filter(Boolean);
      const placeLine = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');

      return {
        heading: loc.name,
        fields: [
          { label: 'Id', value: loc.id },
          { label: 'Type', value: loc.type },
          { label: 'Address', value: loc.address },
          { label: 'Place', value: placeLine || null },
          { label: 'Visits', value: loc.visitCount },
          { label: 'Mentions', value: loc.mentionCount },
          { label: 'Attendance', value: loc.attendanceCount },
          { label: 'Sources count', value: loc.sourceCount },
          { label: 'First visited', value: loc.firstVisited },
          { label: 'Last visited', value: loc.lastVisited },
          { label: 'First mentioned', value: loc.firstMentioned },
          { label: 'Last mentioned', value: loc.lastMentioned },
          { label: 'People', value: people },
          { label: 'Intrinsic tags', value: (loc.intrinsicTags ?? []).map((t) => t.tag).slice(0, 12) },
          { label: 'Visit-context tags', value: (loc.visitContextTags ?? loc.tagCounts ?? []).map((t) => t.tag).slice(0, 12) },
          { label: 'Story tags', value: (loc.storyTags ?? []).map((t) => t.tag).slice(0, 12) },
          { label: 'Tags', value: tags.slice(0, 12) },
          { label: 'Chapters', value: (loc.chapters ?? []).map((c) => c.title || c.id).slice(0, 8) },
          { label: 'Moods (visit context)', value: (loc.moods ?? []).map((m) => m.mood).slice(0, 6) },
          { label: 'Sources', value: loc.sources },
          {
            label: 'Importance',
            value:
              loc.analytics?.importance_score != null
                ? Math.round(loc.analytics.importance_score)
                : null,
          },
          { label: 'Trend', value: loc.analytics?.trend },
          {
            label: 'Coordinates',
            value:
              loc.coordinates?.lat != null && loc.coordinates?.lng != null
                ? `${loc.coordinates.lat}, ${loc.coordinates.lng}`
                : null,
          },
          { label: 'Owner / operator', value: loc.ownerOperator },
          { label: 'Root type', value: loc.root_type },
        ],
        body: loc.description?.trim() || undefined,
      };
    }),
  });
}
