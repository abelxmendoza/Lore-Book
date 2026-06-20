import type { GeneratedTimelineEvent } from '../components/timeline/GeneratedTimelineReveal';

export type StoredTimelineEvent = {
  id: string;
  start_time: string;
  content: string;
  timeline_names?: string[];
  significance?: 'low' | 'medium' | 'high';
  stateChange?: string;
};

export type SavedGeneratedTimeline = {
  id: string;
  query: string;
  queryKey: string;
  events: StoredTimelineEvent[];
  arcTitles: string[];
  isMock: boolean;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export const GENERATED_TIMELINES_STORAGE_KEY = 'lorekeeper_generated_timelines_v1';

export function normalizeTimelineQueryKey(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function serializeTimelineEvent(event: GeneratedTimelineEvent): StoredTimelineEvent {
  return {
    id: event.id,
    start_time: event.start_time,
    content: event.content ?? '',
    timeline_names: event.timeline_names,
    ...('stateChange' in event && event.stateChange ? { stateChange: event.stateChange } : {}),
    ...('significance' in event && event.significance ? { significance: event.significance } : {}),
  };
}

export function findTimelineByQuery(
  library: SavedGeneratedTimeline[],
  query: string
): SavedGeneratedTimeline | undefined {
  const key = normalizeTimelineQueryKey(query);
  return library.find((t) => t.queryKey === key);
}

export function upsertGeneratedTimeline(
  library: SavedGeneratedTimeline[],
  input: {
    query: string;
    events: GeneratedTimelineEvent[];
    isMock: boolean;
    arcTitles?: string[];
    preserveCollapsed?: boolean;
    existingId?: string;
  }
): { library: SavedGeneratedTimeline[]; saved: SavedGeneratedTimeline } {
  const now = new Date().toISOString();
  const queryKey = normalizeTimelineQueryKey(input.query);
  const existing = input.existingId
    ? library.find((t) => t.id === input.existingId)
    : library.find((t) => t.queryKey === queryKey);

  const saved: SavedGeneratedTimeline = {
    id: existing?.id ?? crypto.randomUUID(),
    query: input.query.trim(),
    queryKey,
    events: input.events.map(serializeTimelineEvent),
    arcTitles: input.arcTitles ?? existing?.arcTitles ?? [],
    isMock: input.isMock,
    collapsed: input.preserveCollapsed ? (existing?.collapsed ?? false) : false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const without = library.filter((t) => t.id !== saved.id && t.queryKey !== queryKey);
  return { library: [saved, ...without].slice(0, 40), saved };
}

export function removeGeneratedTimeline(
  library: SavedGeneratedTimeline[],
  id: string
): SavedGeneratedTimeline[] {
  return library.filter((t) => t.id !== id);
}

export function toggleTimelineCollapsed(
  library: SavedGeneratedTimeline[],
  id: string
): SavedGeneratedTimeline[] {
  return library.map((t) =>
    t.id === id ? { ...t, collapsed: !t.collapsed, updatedAt: new Date().toISOString() } : t
  );
}
