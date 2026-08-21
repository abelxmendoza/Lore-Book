import type { StitchedTimelineItem } from '../api/stitchedTimeline';

export type LocationCanonicalTimelineEntry = {
  id: string;
  sourceId: string;
  sourceKind: StitchedTimelineItem['sourceKind'];
  timestamp: string;
  title: string;
  summary?: string;
};

/**
 * Project stitched chronology into the Location modal's existing lane rows.
 * Canonical item ids stay on `id`; backing record ids stay on `sourceId`.
 */
export function stitchedItemsToLocationTimelineEntries(
  items: StitchedTimelineItem[],
): LocationCanonicalTimelineEntry[] {
  return items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    timestamp: item.temporal?.occurred.start ?? item.sortTime,
    title: item.title,
    summary: item.body || undefined,
  }));
}

export function locationTimelineItemFromEntry(
  entry: LocationCanonicalTimelineEntry,
  item?: StitchedTimelineItem,
): StitchedTimelineItem {
  return (
    item ?? {
      id: entry.id,
      kind: entry.sourceKind === 'journal_entry' ? 'moment' : 'event',
      sourceId: entry.sourceId,
      sourceIds: [entry.sourceId],
      sourceKind: entry.sourceKind,
      sourceType: entry.sourceKind,
      sortTime: entry.timestamp,
      userSortIndex: null,
      title: entry.title,
      body: entry.summary ?? '',
    }
  );
}
