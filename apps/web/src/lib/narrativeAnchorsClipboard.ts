import type { NarrativeAnchor } from '../components/narrative/NarrativeAnchorsBook';
import { buildListClipboardText } from './listClipboard';

const TYPE_LABELS: Record<string, string> = {
  life_era: 'Life era',
  school_era: 'School',
  work_era: 'Work',
  relationship_arc: 'Relationship',
  community: 'Community',
  family_period: 'Family',
  project_arc: 'Project',
  travel_period: 'Travel',
  pivotal_event: 'Pivotal event',
  recurring_activity: 'Ritual',
};

function formatYears(startDate?: string, endDate?: string): string | null {
  if (!startDate && !endDate) return null;
  const start = startDate ? new Date(startDate).getFullYear() : null;
  const end = endDate ? new Date(endDate).getFullYear() : null;
  if (start && end && start === end) return String(start);
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}–present`;
  return `Until ${end}`;
}

export function buildNarrativeAnchorsClipboardText(anchors: NarrativeAnchor[]): string {
  return buildListClipboardText({
    title: 'Narrative Anchors',
    items: anchors.map((anchor) => {
      const people = anchor.entities.map((m) => m.name).filter(Boolean);
      const places = anchor.places.map((m) => m.name).filter(Boolean);
      const groups = anchor.groups.map((m) => m.name).filter(Boolean);
      const events = anchor.events.map((m) => m.name).filter(Boolean);
      const evidence = anchor.evidence.map((e) => e.label).filter(Boolean).slice(0, 8);

      return {
        heading: anchor.title,
        fields: [
          { label: 'Id', value: anchor.id },
          { label: 'Type', value: TYPE_LABELS[anchor.anchorType] ?? anchor.anchorType },
          { label: 'Years', value: formatYears(anchor.startDate, anchor.endDate) },
          { label: 'Confidence', value: Math.round(anchor.confidence * 100) / 100 },
          { label: 'Gravity', value: Math.round(anchor.gravityScore * 100) / 100 },
          { label: 'People', value: people.slice(0, 12) },
          { label: 'Places', value: places.slice(0, 12) },
          { label: 'Groups', value: groups.slice(0, 12) },
          { label: 'Events', value: events.slice(0, 12) },
          { label: 'Evidence', value: evidence },
          { label: 'Signals', value: anchor.provenance?.signals?.slice(0, 8) },
          { label: 'Built at', value: anchor.provenance?.builtAt },
        ],
      };
    }),
  });
}
