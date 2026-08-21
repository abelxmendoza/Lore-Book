import type { StitchedTimelineItem } from '../api/stitchedTimeline';

export type CharacterStitchedTimelineEvent = {
  id: string;
  eventId?: string;
  eventTitle: string;
  eventDate: string;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  timePrecision?: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent?: boolean;
  sourceKind: StitchedTimelineItem['sourceKind'];
  sourceId: string;
  sourceIds: string[];
  userPresence: NonNullable<StitchedTimelineItem['userPresence']>;
};

export type CharacterStitchedTimelines = {
  sharedExperiences: CharacterStitchedTimelineEvent[];
  lore: CharacterStitchedTimelineEvent[];
};

function occurrenceDate(item: StitchedTimelineItem): string {
  if (item.occurrenceStatus === 'unresolved') return '';
  return item.temporal?.occurred.start ?? '';
}

function toCharacterEvent(item: StitchedTimelineItem): CharacterStitchedTimelineEvent {
  const userPresence = item.userPresence ?? 'unknown';
  const occurrenceStatus = item.occurrenceStatus
    ?? (item.temporal?.occurred.status === 'unresolved' ? 'unresolved'
      : item.temporal?.occurred.status === 'range' ? 'range'
        : item.temporal?.occurred.start ? 'confirmed' : undefined);
  return {
    id: item.id,
    eventId: item.sourceId,
    eventTitle: item.title,
    eventDate: occurrenceDate(item),
    recordedAt: item.temporal?.recordedAt ?? null,
    occurrenceStatus,
    timePrecision: item.timePrecision ?? item.temporal?.occurred.precision,
    eventSummary: item.body || undefined,
    eventType: item.canonicalEventType,
    userWasPresent: userPresence === 'attended',
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    sourceIds: item.sourceIds ?? [item.sourceId],
    userPresence,
  };
}

/**
 * Project stitched chronology into Character Story lanes.
 * Presence is the only lane signal: attended → with you; everything else → lore.
 * Empty input stays empty — never invent rows from character_timeline_events.
 */
export function stitchedItemsToCharacterTimeline(
  items: StitchedTimelineItem[],
): CharacterStitchedTimelines {
  const sharedExperiences: CharacterStitchedTimelineEvent[] = [];
  const lore: CharacterStitchedTimelineEvent[] = [];
  for (const item of items) {
    const event = toCharacterEvent(item);
    if (event.userPresence === 'attended') sharedExperiences.push(event);
    else lore.push(event);
  }
  return { sharedExperiences, lore };
}
