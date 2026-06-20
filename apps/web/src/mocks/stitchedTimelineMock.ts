import type { StitchedTimelineItem, StitchedTimelineResult } from '../api/stitchedTimeline';
import { buildMockGeneratedTimeline } from './timelineGenerationMock';

function formatTitle(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Undated moment';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Demo-mode stitched timeline built from generated-timeline mock moments. */
export function buildMockStitchedTimeline(options?: {
  scopeLabel?: string | null;
  lifeArcId?: string;
}): StitchedTimelineResult {
  const scopeLabel = options?.scopeLabel?.trim() || 'Your full timeline';
  const events = buildMockGeneratedTimeline(scopeLabel);
  const items: StitchedTimelineItem[] = events.map((event, index) => ({
    id: `stitched-${event.id}`,
    kind: 'moment',
    sourceId: event.id,
    sortTime: event.start_time,
    userSortIndex: index,
    title: formatTitle(event.start_time),
    body: event.content,
    userPresence: 'attended',
  }));

  return {
    scope_type: options?.lifeArcId ? 'life_arc' : 'global',
    scope_id: options?.lifeArcId ?? 'demo-global',
    scope_label: scopeLabel,
    items,
    has_user_order: false,
  };
}

export const DEMO_GENERATED_TIMELINE_SEEDS = [
  'My nightlife era',
  '2024 career',
  'Everything with Alex',
] as const;
