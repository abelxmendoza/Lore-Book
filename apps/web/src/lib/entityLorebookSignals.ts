/**
 * Count real related moments / days / words for entity-scoped LoreBook tiers.
 * Prefer timeline events and journal-linked stories over visit/usage proxies.
 */

import { fetchJson } from './api';

export type EntityLorebookCompileSignals = {
  eventCount?: number;
  uniqueDays?: number;
  wordCount?: number;
  domainReady?: boolean;
};

export type EntityLorebookCompileFocus = {
  characterId?: string;
  locationId?: string;
  organizationId?: string;
  skillId?: string;
  themes?: string;
};

export type EntityMoment = {
  id?: string;
  date?: string | null;
  title?: string | null;
  summary?: string | null;
  content?: string | null;
};

type ConversationEvent = {
  id?: string;
  title?: string | null;
  summary?: string | null;
  start_time?: string | null;
  people?: string[];
  locations?: string[];
};

type CharacterTimelineEvent = {
  id?: string;
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  eventSummary?: string;
};

const EMPTY: EntityLorebookCompileSignals = {
  eventCount: 0,
  uniqueDays: 0,
  wordCount: 0,
};

let eventsCache: { at: number; events: ConversationEvent[] } | null = null;
const EVENTS_TTL_MS = 45_000;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function dayKey(value?: string | null): string | null {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Subject match — avoid tiny false positives ("a", "in"). */
export function matchesSubject(haystack: string, subject: string): boolean {
  const needle = normalize(subject);
  if (needle.length < 2) return false;
  return normalize(haystack).includes(needle);
}

export function summarizeEntityMoments(moments: EntityMoment[]): EntityLorebookCompileSignals {
  const days = new Set<string>();
  let words = 0;
  for (const moment of moments) {
    const day = dayKey(moment.date);
    if (day) days.add(day);
    words += wordCount(`${moment.title ?? ''} ${moment.summary ?? ''} ${moment.content ?? ''}`);
  }
  return {
    eventCount: moments.length,
    uniqueDays: days.size,
    wordCount: words,
  };
}

function dedupeMoments(moments: EntityMoment[]): EntityMoment[] {
  const seen = new Set<string>();
  const out: EntityMoment[] = [];
  for (const moment of moments) {
    const key =
      moment.id ||
      `${dayKey(moment.date) ?? ''}|${normalize(moment.title ?? '')}|${normalize(moment.summary ?? '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(moment);
  }
  return out;
}

export function filterEventsForSubject(
  events: ConversationEvent[],
  subjectLabel: string,
  mode: 'location' | 'organization' | 'skill' | 'theme' = 'theme',
): EntityMoment[] {
  const subject = subjectLabel.trim();
  if (!subject) return [];

  return events
    .filter((event) => {
      const title = event.title ?? '';
      const summary = event.summary ?? '';
      const blob = `${title} ${summary}`;
      if (mode === 'location') {
        const inLocations = (event.locations ?? []).some((loc) => matchesSubject(loc, subject));
        return inLocations || matchesSubject(blob, subject);
      }
      if (mode === 'organization' || mode === 'skill' || mode === 'theme') {
        const inPeople = (event.people ?? []).some((person) => matchesSubject(person, subject));
        return inPeople || matchesSubject(blob, subject);
      }
      return matchesSubject(blob, subject);
    })
    .map((event) => ({
      id: event.id,
      date: event.start_time,
      title: event.title,
      summary: event.summary,
    }));
}

async function loadConversationEvents(): Promise<ConversationEvent[]> {
  const now = Date.now();
  if (eventsCache && now - eventsCache.at < EVENTS_TTL_MS) {
    return eventsCache.events;
  }
  const result = await fetchJson<{ success?: boolean; events?: ConversationEvent[] }>(
    '/api/conversation/events',
  );
  const events = Array.isArray(result.events) ? result.events : [];
  eventsCache = { at: now, events };
  return events;
}

async function signalsFromCharacter(characterId: string): Promise<EntityLorebookCompileSignals> {
  const result = await fetchJson<{
    success?: boolean;
    timelines?: {
      sharedExperiences?: CharacterTimelineEvent[];
      lore?: CharacterTimelineEvent[];
    };
  }>(`/api/conversation/characters/${characterId}/timelines`);

  const shared = result.timelines?.sharedExperiences ?? [];
  const lore = result.timelines?.lore ?? [];
  const moments: EntityMoment[] = [...shared, ...lore].map((event) => ({
    id: event.eventId || event.id,
    date: event.eventDate,
    title: event.eventTitle,
    summary: event.eventSummary,
  }));
  return summarizeEntityMoments(dedupeMoments(moments));
}

async function signalsFromLocation(
  locationId: string,
  subjectLabel: string,
): Promise<EntityLorebookCompileSignals> {
  const [profileResult, events] = await Promise.all([
    fetchJson<{ location?: { entries?: Array<{ id?: string; date?: string; summary?: string | null }> } }>(
      `/api/locations/${locationId}`,
    ).catch(() => ({ location: undefined })),
    loadConversationEvents().catch(() => [] as ConversationEvent[]),
  ]);

  const entryMoments: EntityMoment[] = (profileResult.location?.entries ?? []).map((entry) => ({
    id: entry.id ? `entry:${entry.id}` : undefined,
    date: entry.date,
    summary: entry.summary,
  }));
  const eventMoments = filterEventsForSubject(events, subjectLabel, 'location');
  return summarizeEntityMoments(dedupeMoments([...entryMoments, ...eventMoments]));
}

async function signalsFromOrganization(
  organizationId: string,
  subjectLabel: string,
): Promise<EntityLorebookCompileSignals> {
  const [orgResult, events] = await Promise.all([
    fetchJson<{
      organization?: {
        stories?: Array<{ id?: string; title?: string; summary?: string; date?: string }>;
        events?: Array<{ id?: string; title?: string; date?: string }>;
      };
    }>(`/api/organizations/${organizationId}`).catch(() => ({ organization: undefined })),
    loadConversationEvents().catch(() => [] as ConversationEvent[]),
  ]);

  const org = orgResult.organization;
  const orgMoments: EntityMoment[] = [
    ...(org?.stories ?? []).map((story) => ({
      id: story.id ? `story:${story.id}` : undefined,
      date: story.date,
      title: story.title,
      summary: story.summary,
    })),
    ...(org?.events ?? []).map((event) => ({
      id: event.id ? `org-event:${event.id}` : undefined,
      date: event.date,
      title: event.title,
    })),
  ];
  const eventMoments = filterEventsForSubject(events, subjectLabel, 'organization');
  return summarizeEntityMoments(dedupeMoments([...orgMoments, ...eventMoments]));
}

async function signalsFromTheme(
  subjectLabel: string,
  mode: 'skill' | 'theme',
): Promise<EntityLorebookCompileSignals> {
  const events = await loadConversationEvents();
  return summarizeEntityMoments(filterEventsForSubject(events, subjectLabel, mode));
}

/**
 * Resolve real content buildup for an entity-focused Compile LoreBook control.
 */
export async function fetchEntityLorebookSignals(input: {
  subjectLabel: string;
  focus?: EntityLorebookCompileFocus;
}): Promise<EntityLorebookCompileSignals> {
  const subjectLabel = input.subjectLabel.trim();
  const focus = input.focus;

  try {
    if (focus?.characterId) {
      return await signalsFromCharacter(focus.characterId);
    }
    if (focus?.locationId) {
      return await signalsFromLocation(focus.locationId, subjectLabel || focus.themes || '');
    }
    if (focus?.organizationId) {
      return await signalsFromOrganization(focus.organizationId, subjectLabel || focus.themes || '');
    }
    if (focus?.skillId) {
      return await signalsFromTheme(subjectLabel || focus.themes || '', 'skill');
    }
    if (subjectLabel || focus?.themes) {
      return await signalsFromTheme(subjectLabel || focus?.themes || '', 'theme');
    }
  } catch {
    return EMPTY;
  }

  return EMPTY;
}

/** Test helper — clear the conversation-events cache. */
export function clearEntityLorebookSignalsCache(): void {
  eventsCache = null;
}
