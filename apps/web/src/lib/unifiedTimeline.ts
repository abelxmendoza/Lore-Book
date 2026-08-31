import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import type { ChronologyEntry, TimePrecision } from '../types/timelineV2';

function mapPrecision(precision?: string): TimePrecision {
  switch (precision) {
    case 'exact':
    case 'time_of_day':
      return 'exact';
    case 'date':
    case 'day':
      return 'day';
    case 'month':
    case 'season':
      return 'month';
    case 'year':
      return 'year';
    case 'approximate':
    case 'fuzzy':
    case 'relative':
    case 'era':
    case 'unknown':
      return 'approximate';
    default:
      return 'approximate';
  }
}

/**
 * Project the canonical stitched feed into the legacy chronology shape used by
 * Swimlanes, Story counts, and generated timeline search.
 *
 * Precision/confidence come from Chronology Authority — never invent exact/1.0.
 */
export function stitchedItemsToChronology(items: StitchedTimelineItem[], userId = ''): ChronologyEntry[] {
  return items.map((item) => {
    const timeConfidence =
      typeof item.timeConfidence === 'number'
        ? item.timeConfidence
        : typeof item.confidence === 'number'
          ? item.confidence
          : 0.5;
    const timelineNames = [...new Set([item.timelineTrack, item.sourceType].filter(Boolean) as string[])];
    return {
      id: item.id,
      user_id: userId,
      journal_entry_id: item.sourceKind === 'journal_entry' ? item.sourceId : '',
      start_time: item.temporal?.occurred.start ?? item.sortTime,
      end_time: item.temporal?.occurred.end ?? null,
      time_precision: mapPrecision(item.timePrecision),
      time_confidence: timeConfidence,
      content: [item.title, item.body].filter((part) => typeof part === 'string' && part.trim()).join('\n'),
      timeline_memberships: [],
      timeline_names: timelineNames,
      source_kind: item.sourceKind,
      source_id: item.sourceId,
      source_ids: item.sourceIds,
      source_type: item.sourceType,
      timeline_track: item.timelineTrack,
      title: item.title,
      tags: item.tags ?? [],
      user_presence: item.userPresence,
      temporal_role: item.temporalRole,
    };
  });
}

export function filterChronologyByExactDate(entries: ChronologyEntry[], date: string): ChronologyEntry[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return entries.filter((entry) => entry.start_time.slice(0, 10) === date);
}

export function sortStitchedItemsNewestFirst(items: StitchedTimelineItem[]): StitchedTimelineItem[] {
  return [...items].sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());
}
