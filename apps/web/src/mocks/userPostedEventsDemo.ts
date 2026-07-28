/**
 * Demo-mode store for user-posted Life Log events (localStorage).
 */

const STORAGE_KEY = 'lorebook.demo.userPostedEvents.v1';

export type DemoEventVenueStop = {
  location_id?: string | null;
  location_name: string;
  order: number;
  role: 'primary' | 'afterparty' | 'other';
};

export type DemoEventStory = {
  id: string;
  body: string;
  created_at: string;
  media_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
};

export type DemoUserPostedEvent = {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  start_time: string | null;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  source_count: number;
  created_at: string;
  updated_at: string;
  metadata: {
    created_via: 'user_posted';
    flyer_url?: string | null;
    photo_urls?: string[];
    when_text?: string | null;
    primary_place?: { id: string | null; name: string } | null;
    venue_stops?: DemoEventVenueStop[];
    organization_ids?: string[];
    organization_names?: string[];
    stories?: DemoEventStory[];
  };
};

function readAll(): DemoUserPostedEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoUserPostedEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(events: DemoUserPostedEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function listDemoUserPostedEvents(): DemoUserPostedEvent[] {
  return readAll().sort((a, b) => {
    const aT = a.start_time ? new Date(a.start_time).getTime() : 0;
    const bT = b.start_time ? new Date(b.start_time).getTime() : 0;
    return bT - aT;
  });
}

export function createDemoUserPostedEvent(input: {
  title?: string | null;
  start_time?: string | null;
  when_text?: string | null;
  summary?: string | null;
  flyer_url?: string | null;
  photo_urls?: string[] | null;
  location_id?: string | null;
  location_name?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  story?: string | null;
  venue_stops?: Array<{ location_id?: string | null; location_name: string; role?: 'afterparty' | 'other' }>;
}): DemoUserPostedEvent {
  const now = new Date().toISOString();
  const venueStops: DemoEventVenueStop[] = [];
  if (input.location_name?.trim()) {
    venueStops.push({
      location_id: input.location_id ?? null,
      location_name: input.location_name.trim(),
      order: 0,
      role: 'primary',
    });
  }
  for (const stop of input.venue_stops ?? []) {
    const name = stop.location_name.trim();
    if (!name) continue;
    venueStops.push({
      location_id: stop.location_id ?? null,
      location_name: name,
      order: venueStops.length,
      role: stop.role === 'other' ? 'other' : 'afterparty',
    });
  }
  const stories: DemoEventStory[] = [];
  if (input.story?.trim()) {
    stories.push({
      id: `demo-story-${Date.now()}`,
      body: input.story.trim(),
      created_at: now,
      location_id: input.location_id ?? null,
      location_name: input.location_name ?? null,
    });
  }
  const photoUrls = (input.photo_urls ?? [])
    .map((u) => String(u ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const flyer = input.flyer_url?.trim() || photoUrls[0] || null;
  const storyText = input.story?.trim() || '';
  const title =
    input.title?.trim() ||
    (storyText
      ? storyText.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 72) || 'Untitled moment'
      : 'Posted moment');
  const whenLabel = input.when_text?.trim() || null;
  let startTime: string | null = null;
  if (input.start_time?.trim()) {
    const parsed = new Date(input.start_time);
    startTime = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const event: DemoUserPostedEvent = {
    id: `demo-posted-event-${Date.now()}`,
    title,
    summary: input.summary?.trim() || storyText.slice(0, 280) || title,
    type: 'attended_event',
    start_time: startTime,
    end_time: null,
    confidence: 1,
    people: [],
    locations: venueStops.map((s) => s.location_name),
    activities: [],
    source_count: 0,
    created_at: now,
    updated_at: now,
    metadata: {
      created_via: 'user_posted',
      flyer_url: flyer,
      photo_urls: photoUrls.length > 0 ? photoUrls : flyer ? [flyer] : [],
      when_text: whenLabel,
      primary_place: venueStops[0]
        ? { id: venueStops[0].location_id ?? null, name: venueStops[0].location_name }
        : null,
      venue_stops: venueStops,
      organization_ids: input.organization_id ? [input.organization_id] : [],
      organization_names: input.organization_name ? [input.organization_name] : [],
      stories,
    },
  };
  writeAll([event, ...readAll()]);
  return event;
}

export function addDemoEventStory(
  eventId: string,
  body: string,
  opts?: { location_id?: string | null; location_name?: string | null },
): DemoEventStory {
  const all = readAll();
  const idx = all.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error('Event not found');
  const story: DemoEventStory = {
    id: `demo-story-${Date.now()}`,
    body: body.trim(),
    created_at: new Date().toISOString(),
    location_id: opts?.location_id ?? null,
    location_name: opts?.location_name ?? null,
  };
  const event = all[idx];
  const stories = [...(event.metadata.stories ?? []), story];
  all[idx] = {
    ...event,
    updated_at: new Date().toISOString(),
    metadata: { ...event.metadata, stories },
  };
  writeAll(all);
  return story;
}

export function addDemoEventVenue(
  eventId: string,
  stop: { location_id?: string | null; location_name: string; role?: 'afterparty' | 'other' },
): DemoEventVenueStop[] {
  const all = readAll();
  const idx = all.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error('Event not found');
  const event = all[idx];
  const venueStops = [...(event.metadata.venue_stops ?? [])];
  const next: DemoEventVenueStop = {
    location_id: stop.location_id ?? null,
    location_name: stop.location_name.trim(),
    order: venueStops.length,
    role: stop.role === 'other' ? 'other' : 'afterparty',
  };
  venueStops.push(next);
  all[idx] = {
    ...event,
    locations: [...event.locations, next.location_name],
    updated_at: new Date().toISOString(),
    metadata: { ...event.metadata, venue_stops: venueStops },
  };
  writeAll(all);
  return venueStops;
}

export function getDemoUserPostedEvent(eventId: string): DemoUserPostedEvent | null {
  return readAll().find((e) => e.id === eventId) ?? null;
}

export function listDemoUserPostedEventsForOrganization(
  organizationId: string,
  organizationName?: string,
): DemoUserPostedEvent[] {
  const nameKey = organizationName?.trim().toLowerCase() ?? '';
  return listDemoUserPostedEvents().filter((e) => {
    if (e.metadata.organization_ids?.includes(organizationId)) return true;
    if (nameKey && e.metadata.organization_names?.some((n) => n.toLowerCase() === nameKey)) return true;
    return false;
  });
}

export function listDemoUserPostedEventsForLocation(
  locationId: string,
  locationName?: string,
): DemoUserPostedEvent[] {
  const nameKey = locationName?.trim().toLowerCase() ?? '';
  return listDemoUserPostedEvents().filter((e) => {
    const stops = e.metadata.venue_stops ?? [];
    if (stops.some((s) => s.location_id === locationId)) return true;
    if (e.metadata.primary_place?.id === locationId) return true;
    if (nameKey && stops.some((s) => s.location_name.toLowerCase() === nameKey)) return true;
    if (nameKey && e.metadata.primary_place?.name?.toLowerCase() === nameKey) return true;
    return false;
  });
}
