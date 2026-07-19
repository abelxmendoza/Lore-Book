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
    sourceKind: 'journal_entry',
    sourceIds: [event.id],
    sourceType: 'demo',
    userPresence: 'attended',
    ...(options?.lifeArcId ? { contribution: Math.max(65, 100 - index * 6) } : {}),
  }));
  const startDate = items[0]?.sortTime.slice(0, 10) ?? null;
  const endDate = items.at(-1)?.sortTime.slice(0, 10) ?? startDate;

  return {
    scope_type: options?.lifeArcId ? 'life_arc' : 'global',
    scope_id: options?.lifeArcId ?? 'demo-global',
    scope_label: scopeLabel,
    items,
    has_user_order: false,
    ...(options?.lifeArcId ? {
      chapter: {
        title: scopeLabel,
        thesis: `This chapter tells the story of ${scopeLabel.toLowerCase()} and the moments that moved it forward.`,
        dominantTheme: scopeLabel,
        startDate,
        endDate,
        participants: [],
        locations: [],
        supportingEventIds: items.map((item) => item.sourceId),
        backgroundEventIds: [],
        backgroundContext: ['The broader life circumstances surrounding this chapter.'],
        outcomes: ['The story advanced through the scenes shown below.'],
        contributionScores: Object.fromEntries(items.map((item, index) => [item.sourceId, Math.max(65, 100 - index * 6)])),
        quality: {
          narrativeCoherence: 86,
          topicPurity: 90,
          chronologicalFlow: 100,
          overallStoryQuality: 89,
        },
        confidence: 0.86,
      },
    } : {}),
  };
}

export const DEMO_GENERATED_TIMELINE_SEEDS = [
  'My nightlife era',
  '2024 career',
  'Everything with Alex',
] as const;
