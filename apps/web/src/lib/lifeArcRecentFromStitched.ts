import type { StitchedTimelineItem, StitchedTimelineResult } from '../api/stitchedTimeline';

export type Timeframe = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS';

export interface LifeArcEvent {
  id: string;
  canonicalItemId: string;
  sourceId: string;
  sourceKind: StitchedTimelineItem['sourceKind'] | 'unknown';
  title: string;
  summary: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  peopleIds?: string[];
  locationIds?: string[];
  activities: string[];
  type: string | null;
}

export interface LifeArcData {
  timeframe: Timeframe;
  event_groups: {
    significant_events: LifeArcEvent[];
    recurring_patterns: Array<{
      label: string;
      event_ids: string[];
      frequency: number;
    }>;
    new_entities: Array<{
      type: 'PERSON' | 'LOCATION';
      id: string;
      name: string;
      first_seen: string;
    }>;
    unresolved_events: LifeArcEvent[];
  };
  narrative_summary: {
    text: string;
    event_ids: string[];
    confidence: number;
  };
  change_signals: {
    first_time_people: Array<{ id: string; name: string; first_seen: string }>;
    first_time_locations: Array<{ id: string; name: string; first_seen: string }>;
    pattern_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
    emotional_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
  };
  stability_state?: 'STABLE_EMPTY' | 'STABLE_CONTINUATION' | 'UNSTABLE_UNCLEAR' | 'SIGNAL_PRESENT';
  is_silence?: boolean;
  events_with_continuity?: Array<LifeArcEvent & { continuity_notes?: string[] }>;
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
  LAST_90_DAYS: 90,
};

export function timeframeWindow(
  timeframe: Timeframe,
  now = new Date(),
): { start: string; end: string; days: number } {
  const days = TIMEFRAME_DAYS[timeframe];
  const end = new Date(now.getTime());
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    days,
  };
}

export function priorTimeframeWindow(
  timeframe: Timeframe,
  now = new Date(),
): { start: string; end: string } {
  const current = timeframeWindow(timeframe, now);
  const end = new Date(`${current.start}T00:00:00.000Z`);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - current.days);
  return {
    start: start.toISOString().slice(0, 10),
    end: current.start,
  };
}

function isUnresolvedItem(item: StitchedTimelineItem): boolean {
  if (item.projectionRole === 'unresolved') return true;
  if (item.occurrenceStatus === 'unresolved') return true;
  if (item.temporal?.occurred.status === 'unanchored') return true;
  if (!item.temporal?.occurred.start && item.occurrenceStatus !== 'confirmed') {
    const confidence = item.timeConfidence ?? item.confidence;
    if (confidence == null || confidence < 0.4) return true;
  }
  const confidence = item.timeConfidence ?? item.confidence ?? 0.5;
  return confidence < 0.4;
}

function isExcluded(item: StitchedTimelineItem): boolean {
  return item.projectionRole === 'excluded' || item.projectionRole === 'evidence';
}

function uniqueBySourceId(items: StitchedTimelineItem[]): StitchedTimelineItem[] {
  const seen = new Set<string>();
  const out: StitchedTimelineItem[] = [];
  for (const item of items) {
    const key = item.sourceId || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function stitchedItemToLifeArcEvent(item: StitchedTimelineItem) {
  const occurred = item.temporal?.occurred;
  const unresolved = isUnresolvedItem(item);
  const start =
    occurred?.start ??
    (unresolved ? occurred?.start ?? item.sortTime : item.sortTime);
  return {
    id: item.sourceId || item.id,
    canonicalItemId: item.id,
    sourceId: item.sourceId || item.id,
    sourceKind: item.sourceKind,
    title: item.title?.trim() || 'Untitled moment',
    summary: item.body?.trim() ? item.body : null,
    start_time: start,
    end_time: occurred?.end ?? null,
    confidence: item.timeConfidence ?? item.confidence ?? 0.5,
    people: [] as string[],
    locations: [] as string[],
    peopleIds: item.peopleIds,
    locationIds: item.locationIds,
    activities: item.tags ?? [],
    type: item.kind === 'event' ? 'event' : item.sourceKind,
  };
}

function recurringFromTags(items: StitchedTimelineItem[]) {
  const counts = new Map<string, string[]>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const label = tag.trim();
      if (!label) continue;
      const ids = counts.get(label) ?? [];
      ids.push(item.sourceId || item.id);
      counts.set(label, ids);
    }
  }
  return [...counts.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([label, event_ids]) => ({
      label,
      event_ids,
      frequency: event_ids.length,
    }));
}

function namedDiff(
  current: string[] | undefined,
  prior: string[] | undefined,
  firstSeen: string,
): Array<{ id: string; name: string; first_seen: string }> {
  const priorSet = new Set((prior ?? []).map((name) => name.trim()).filter(Boolean));
  return (current ?? [])
    .map((name) => name.trim())
    .filter((name) => name && !priorSet.has(name))
    .map((name) => ({ id: name, name, first_seen: firstSeen }));
}

function fallbackNarrative(significantTitles: string[]): string {
  if (significantTitles.length === 0) {
    return 'Recent events have been recorded. Review them to see what stands out.';
  }
  const cited = significantTitles.slice(0, 3).join(', ');
  return `Observations from this period include ${cited}.`;
}

/**
 * Present the canonical stitched feed in the existing LifeArcPanel contract.
 * Does not invent people, places, or exact dates; unresolved items stay unresolved.
 */
export function stitchedResultToLifeArcData(
  current: StitchedTimelineResult,
  timeframe: Timeframe,
  prior?: StitchedTimelineResult | null,
): LifeArcData {
  const visible = current.items.filter((item) => !isExcluded(item));
  const unresolved = uniqueBySourceId([
    ...(current.unresolved_items ?? []),
    ...visible.filter(isUnresolvedItem),
  ]);
  const unresolvedIds = new Set(unresolved.map((item) => item.sourceId || item.id));
  const significant = visible.filter((item) => {
    if (unresolvedIds.has(item.sourceId || item.id)) return false;
    const confidence = item.timeConfidence ?? item.confidence ?? 0.5;
    return confidence >= 0.7;
  });

  const significantEvents = significant.map(stitchedItemToLifeArcEvent);
  const unresolvedEvents = unresolved.map(stitchedItemToLifeArcEvent);
  const patterns = recurringFromTags(visible);
  const firstSeen = current.chapter?.startDate ?? timeframeWindow(timeframe).start;

  const hasSignal = significantEvents.length > 0 || patterns.length > 0;
  const isSilence = !hasSignal && unresolvedEvents.length === 0 && visible.length === 0;
  const stability_state = isSilence
    ? 'STABLE_EMPTY'
    : !hasSignal && unresolvedEvents.length > 0
      ? 'UNSTABLE_UNCLEAR'
      : 'SIGNAL_PRESENT';

  const thesis = current.chapter?.thesis?.trim();
  const narrativeText =
    thesis ||
    (isSilence
      ? 'Nothing notable stands out during this period.'
      : fallbackNarrative(significantEvents.map((event) => event.title)));

  return {
    timeframe,
    event_groups: {
      significant_events: significantEvents,
      recurring_patterns: patterns,
      new_entities: namedDiff(
        current.chapter?.participants,
        prior?.chapter?.participants,
        firstSeen,
      ).map((person) => ({
        type: 'PERSON' as const,
        id: person.id,
        name: person.name,
        first_seen: person.first_seen,
      })),
      unresolved_events: unresolvedEvents,
    },
    narrative_summary: {
      text: narrativeText,
      event_ids: significantEvents.map((event) => event.id),
      confidence: current.chapter?.confidence ?? (hasSignal ? 0.7 : 1),
    },
    change_signals: {
      first_time_people: namedDiff(
        current.chapter?.participants,
        prior?.chapter?.participants,
        firstSeen,
      ),
      first_time_locations: namedDiff(
        current.chapter?.locations,
        prior?.chapter?.locations,
        firstSeen,
      ),
      pattern_shifts: [],
      emotional_shifts: [],
    },
    stability_state,
    is_silence: isSilence,
    events_with_continuity: [],
  };
}
