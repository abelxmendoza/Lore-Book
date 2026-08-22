import type { StitchedTimelineItem } from '../api/stitchedTimeline';

export type CharacterStitchedTimelineEvent = {
  id: string;
  eventId?: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent?: boolean;
  sourceKind: StitchedTimelineItem['sourceKind'];
  sourceId: string;
  userPresence: NonNullable<StitchedTimelineItem['userPresence']>;
};

export type CharacterStitchedTimelines = {
  sharedExperiences: CharacterStitchedTimelineEvent[];
  lore: CharacterStitchedTimelineEvent[];
};

function toCharacterEvent(item: StitchedTimelineItem): CharacterStitchedTimelineEvent {
  const userPresence = item.userPresence ?? 'unknown';
  return {
    id: item.id,
    eventId: item.sourceId,
    eventTitle: item.title,
    eventDate: item.temporal?.occurred.start ?? item.sortTime,
    eventSummary: item.body || undefined,
    eventType: item.canonicalEventType,
    userWasPresent: userPresence === 'attended',
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
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
