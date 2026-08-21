import type { StitchedTimelineItem } from './stitchedTimelineService';

/** Grounded occurrence only. Unresolved / recording-fallback never become a date. */
export function stitchedOccurredStart(
  item: Pick<StitchedTimelineItem, 'occurredAt' | 'occurrenceStatus' | 'temporalProjection'>,
): string | null {
  if (item.occurrenceStatus === 'unresolved' || item.temporalProjection?.isUnresolved) return null;
  return item.occurredAt ?? item.temporalProjection?.occurredStart ?? null;
}

export function stitchedIsFuture(item: StitchedTimelineItem, now = new Date()): boolean {
  if (item.temporalProjection?.temporalState === 'future') {
    return Boolean(stitchedOccurredStart(item));
  }
  const occurred = stitchedOccurredStart(item);
  if (!occurred) return false;
  return Date.parse(occurred) > now.getTime();
}
