import { buildListClipboardText } from './listClipboard';

export type PatternClipboardScene = {
  id: string;
  canonical_title: string;
  dominant_entity_names?: string[];
  recurring_activities?: string[];
  emotional_tone?: string;
  occurrence_count: number;
  continuity_strength: number;
  first_seen_at: string;
  last_seen_at: string;
  source_event_ids?: string[];
  timeline_candidate?: boolean;
};

export function patternContinuityLabel(strength: number): string {
  if (strength >= 0.85) return 'Autobiographical';
  if (strength >= 0.60) return 'Recurring';
  if (strength >= 0.40) return 'Emerging';
  return 'Forming';
}

export function buildPatternsClipboardText(scenes: PatternClipboardScene[]): string {
  return buildListClipboardText({
    title: 'Life Log / Patterns',
    items: scenes.map((scene) => ({
      heading: scene.canonical_title,
      fields: [
        { label: 'Id', value: scene.id },
        { label: 'Occurrences', value: scene.occurrence_count },
        {
          label: 'Continuity',
          value: `${patternContinuityLabel(scene.continuity_strength)} (${Math.round(scene.continuity_strength * 100)}%)`,
        },
        { label: 'People', value: scene.dominant_entity_names?.slice(0, 12) },
        { label: 'Activities', value: scene.recurring_activities?.slice(0, 12) },
        { label: 'Tone', value: scene.emotional_tone },
        { label: 'First seen', value: scene.first_seen_at },
        { label: 'Last seen', value: scene.last_seen_at },
        { label: 'Moments', value: scene.source_event_ids?.length ?? scene.occurrence_count },
        { label: 'Timeline candidate', value: scene.timeline_candidate },
      ],
    })),
  });
}
