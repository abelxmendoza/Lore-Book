import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import type { ChronologyEntry } from '../types/timelineV2';

/**
 * Project the canonical stitched feed into the legacy chronology shape used by
 * Swimlanes, Story counts, and generated timeline search. Keeping this adapter
 * at the view boundary lets every Omni Timeline view refer to the same source
 * record without inventing a second copy of the event.
 */
export function stitchedItemsToChronology(
  items: StitchedTimelineItem[],
  userId = '',
): ChronologyEntry[] {
  return items.map((item) => ({
    id: item.id,
    user_id: userId,
    journal_entry_id: item.sourceKind === 'journal_entry' ? item.sourceId : '',
    start_time: item.sortTime,
    end_time: null,
    time_precision: 'exact',
    time_confidence: item.confidence ?? 1,
    content: item.body || item.title,
    timeline_memberships: [],
    timeline_names: [],
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    source_ids: item.sourceIds,
    source_type: item.sourceType,
    title: item.title,
    tags: item.tags ?? [],
    user_presence: item.userPresence,
    temporal_role: item.temporalRole,
  }));
}

export function filterChronologyByExactDate(
  entries: ChronologyEntry[],
  date: string,
): ChronologyEntry[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return entries.filter((entry) => entry.start_time.slice(0, 10) === date);
}
