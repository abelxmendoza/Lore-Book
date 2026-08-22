import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';

export type CharacterQueryTimelineEvent = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent: boolean;
  sourceKind: StitchedTimelineItem['sourceKind'];
  sourceId: string;
  userPresence: NonNullable<StitchedTimelineItem['userPresence']>;
};

export type CharacterQueryTimelines = {
  sharedExperiences: CharacterQueryTimelineEvent[];
  lore: CharacterQueryTimelineEvent[];
  summary: {
    sharedCount: number;
    loreCount: number;
    recent: CharacterQueryTimelineEvent[];
  };
};

function toEvent(item: StitchedTimelineItem): CharacterQueryTimelineEvent {
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
 * Project character-scoped stitched chronology into the Character Query
 * timelines section. Empty stitched input stays empty — no fallback to
 * character_timeline_events.
 */
export function stitchedItemsToCharacterTimelines(
  items: StitchedTimelineItem[],
): CharacterQueryTimelines {
  const sharedExperiences: CharacterQueryTimelineEvent[] = [];
  const lore: CharacterQueryTimelineEvent[] = [];
  for (const item of items) {
    const event = toEvent(item);
    if (event.userPresence === 'attended') sharedExperiences.push(event);
    else lore.push(event);
  }
  const recent = [...sharedExperiences, ...lore]
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    .slice(0, 8);
  return {
    sharedExperiences,
    lore,
    summary: {
      sharedCount: sharedExperiences.length,
      loreCount: lore.length,
      recent,
    },
  };
}
