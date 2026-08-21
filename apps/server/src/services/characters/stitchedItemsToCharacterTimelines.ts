import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';

export type CharacterQueryTimelineEvent = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  timePrecision?: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent: boolean;
  sourceKind: StitchedTimelineItem['sourceKind'];
  sourceId: string;
  sourceIds: string[];
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

function occurrenceDate(item: StitchedTimelineItem): string {
  if (item.occurrenceStatus === 'unresolved') return '';
  return item.temporal?.occurred.start ?? item.occurredAt ?? '';
}

function toEvent(item: StitchedTimelineItem): CharacterQueryTimelineEvent {
  const userPresence = item.userPresence ?? 'unknown';
  const occurrenceStatus = item.occurrenceStatus
    ?? (item.temporal?.occurred.status === 'unresolved'
      ? 'unresolved'
      : item.temporal?.occurred.status === 'range'
        ? 'range'
        : item.temporal?.occurred.start || item.occurredAt
          ? 'confirmed'
          : undefined);
  return {
    id: item.id,
    eventId: item.sourceId,
    eventTitle: item.title,
    eventDate: occurrenceDate(item),
    recordedAt: item.temporal?.recordedAt ?? item.recordedAt ?? null,
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
    .sort((a, b) => {
      const aTime = new Date(a.eventDate).getTime();
      const bTime = new Date(b.eventDate).getTime();
      const aOk = Number.isFinite(aTime);
      const bOk = Number.isFinite(bTime);
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return bTime - aTime;
    })
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
