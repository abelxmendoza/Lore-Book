/**
 * User-posted Life Log events — flyer shows, birthdays, festivals, etc.
 * Stored in `resolved_events` with metadata.created_via = 'user_posted'.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { isPublishableLifeLogTitle } from './lifeLogEligibilityPolicy';
import { parseApproximateWhen, titleFromStory } from './parseApproximateWhen';
import { attributeOrganizationsForEventText } from '../organizations/organizationEventAttributionService';

export type EventVenueStop = {
  location_id?: string | null;
  location_name: string;
  order: number;
  role: 'primary' | 'afterparty' | 'other';
};

export type EventStory = {
  id: string;
  body: string;
  created_at: string;
  media_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
};

export type CreateUserPostedEventInput = {
  /** Optional — derived from story when omitted. */
  title?: string | null;
  /** Exact ISO / date string when known; prefer when_text for fuzzy phrases. */
  start_time?: string | null;
  /** Free-text when: "summer 2019", "around June", "last weekend". */
  when_text?: string | null;
  summary?: string | null;
  flyer_url?: string | null;
  /** Already-hosted photo/flyer URLs (optional). */
  photo_urls?: string[] | null;
  /** Inline flyer/photos (data URLs) — stored to photos bucket after insert. */
  photos?: Array<{ dataUrl: string; fileName?: string | null }> | null;
  location_id?: string | null;
  location_name?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  /** Optional first story body at create time. */
  story?: string | null;
  /** Extra venue stops after the primary place (afterparty, etc.). */
  venue_stops?: Array<{
    location_id?: string | null;
    location_name: string;
    role?: 'afterparty' | 'other';
  }>;
};

export type UserPostedEventRow = {
  id: string;
  title: string;
  summary: string | null;
  type: string;
  start_time: string | null;
  locations: string[];
  people: string[];
  activities: string[];
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function assertUserPostedTitle(title: string): void {
  const value = cleanTitle(title);
  if (value.length < 2) throw new Error('Write what happened, or add a title / photo.');
  if (!isPublishableLifeLogTitle(value)) {
    // Soften: story dumps and first-person openers are fine for user posts.
    const words = value.split(/\s+/);
    if (words.length < 1 || words.length > 24) {
      throw new Error('Keep the title reasonably short — or just paste the story.');
    }
  }
}

function buildVenueStops(
  primary?: { location_id?: string | null; location_name?: string | null },
  extra?: CreateUserPostedEventInput['venue_stops'],
): EventVenueStop[] {
  const stops: EventVenueStop[] = [];
  if (primary?.location_name?.trim()) {
    stops.push({
      location_id: primary.location_id ?? null,
      location_name: primary.location_name.trim(),
      order: 0,
      role: 'primary',
    });
  }
  for (const stop of extra ?? []) {
    const name = String(stop.location_name ?? '').trim();
    if (!name) continue;
    stops.push({
      location_id: stop.location_id ?? null,
      location_name: name,
      order: stops.length,
      role: stop.role === 'other' ? 'other' : 'afterparty',
    });
  }
  return stops;
}

export async function createUserPostedEvent(
  userId: string,
  input: CreateUserPostedEventInput,
): Promise<UserPostedEventRow> {
  const storyText = input.story?.trim() || '';
  const hasMedia =
    Boolean(input.flyer_url?.trim()) ||
    (input.photo_urls?.length ?? 0) > 0 ||
    (input.photos?.length ?? 0) > 0;

  let title = cleanTitle(input.title ?? '');
  if (!title && storyText) title = titleFromStory(storyText);
  if (!title && hasMedia) title = 'Posted moment';
  if (!title) {
    throw new Error('Write what happened, or add a title / photo.');
  }
  assertUserPostedTitle(title);

  const when = parseApproximateWhen(input.when_text || input.start_time || null);
  // Prefer structured start_time only when when_text was blank and start_time parses.
  if (!input.when_text?.trim() && input.start_time?.trim()) {
    const fromStart = parseApproximateWhen(input.start_time);
    if (fromStart.startTime) {
      Object.assign(when, fromStart);
    }
  }

  const venueStops = buildVenueStops(
    {
      location_id: input.location_id,
      location_name: input.location_name,
    },
    input.venue_stops,
  );

  const stories: EventStory[] = [];
  if (storyText) {
    stories.push({
      id: randomUUID(),
      body: storyText,
      created_at: new Date().toISOString(),
      location_id: input.location_id ?? null,
      location_name: input.location_name ?? null,
    });
  }

  const locationIds = venueStops
    .map((s) => s.location_id)
    .filter((id): id is string => Boolean(id));
  // Also keep primary name strings so cards display even if UUID resolve fails.
  const locationNames = venueStops.map((s) => s.location_name);

  const organizationIds = input.organization_id ? [input.organization_id] : [];
  const organizationNames = input.organization_name?.trim()
    ? [input.organization_name.trim()]
    : [];

  const seedPhotoUrls = (input.photo_urls ?? [])
    .map((u) => String(u ?? '').trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 8);
  const flyerSeed = input.flyer_url?.trim() || seedPhotoUrls[0] || null;

  const metadata: Record<string, unknown> = {
    created_via: 'user_posted',
    flyer_url: flyerSeed,
    photo_urls: seedPhotoUrls.length > 0 ? seedPhotoUrls : flyerSeed ? [flyerSeed] : [],
    when_text: when.whenText,
    primary_place:
      venueStops[0]
        ? {
            id: venueStops[0].location_id ?? null,
            name: venueStops[0].location_name,
          }
        : null,
    venue_stops: venueStops,
    organization_ids: organizationIds,
    organization_names: organizationNames,
    stories,
    life_log: {
      publication_status: 'published',
      eligibility_reason: 'attended_event',
      eligibility_confidence: 1,
      policy_version: 'v2',
    },
  };

  const attributedMetadata = await attributeOrganizationsForEventText({
    userId,
    text: `${title}. ${input.summary ?? ''} ${storyText}`.trim(),
    explicitOrganizationId: input.organization_id ?? null,
    existingMetadata: metadata,
  });

  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .insert({
      user_id: userId,
      title,
      summary: input.summary?.trim() || storyText.slice(0, 280) || title,
      type: 'attended_event',
      start_time: when.startTime,
      locations: locationIds.length > 0 ? locationIds : locationNames,
      people: [],
      activities: [],
      confidence: 1,
      temporal_source: 'user_stated',
      temporal_precision: when.temporalPrecision,
      temporal_status: when.temporalStatus,
      metadata: attributedMetadata,
    })
    .select('*')
    .single();

  if (error || !data) {
    logger.error({ error, userId, title }, 'user_posted_event: insert failed');
    throw new Error('Could not save this event to your Life Log.');
  }

  let finalMetadata = (data.metadata as Record<string, unknown>) ?? metadata;
  const inlinePhotos = (input.photos ?? []).filter((p) => typeof p?.dataUrl === 'string' && p.dataUrl.startsWith('data:image/'));
  if (inlinePhotos.length > 0) {
    try {
      const { storeEventPhotos } = await import('./eventMediaStorage');
      const stored = await storeEventPhotos(
        userId,
        data.id as string,
        inlinePhotos.map((p) => ({ dataUrl: p.dataUrl, fileName: p.fileName ?? null })),
      );
      if (stored.length > 0) {
        const urls = stored.map((s) => s.url);
        const mergedUrls = [...urls, ...seedPhotoUrls].filter(
          (u, i, arr) => arr.indexOf(u) === i,
        );
        finalMetadata = {
          ...finalMetadata,
          flyer_url: urls[0] || flyerSeed,
          photo_urls: mergedUrls,
          photo_storage: stored.map((s) => ({
            url: s.url,
            storagePath: s.storagePath,
            photoId: s.photoId,
          })),
        };
        const { error: metaErr } = await supabaseAdmin
          .from('resolved_events')
          .update({ metadata: finalMetadata, updated_at: new Date().toISOString() })
          .eq('id', data.id)
          .eq('user_id', userId);
        if (metaErr) {
          logger.warn({ metaErr, eventId: data.id }, 'user_posted_event: media metadata update failed');
        }
      }
    } catch (err) {
      logger.warn({ err, eventId: data.id }, 'user_posted_event: media store failed — event still saved');
    }
  }

  return {
    id: data.id as string,
    title: data.title as string,
    summary: (data.summary as string | null) ?? null,
    type: (data.type as string) ?? 'attended_event',
    start_time: (data.start_time as string | null) ?? null,
    locations: Array.isArray(data.locations) ? (data.locations as string[]) : locationNames,
    people: [],
    activities: [],
    confidence: 1,
    metadata: finalMetadata,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export async function addStoryToUserPostedEvent(
  userId: string,
  eventId: string,
  body: string,
  opts?: { media_url?: string | null; location_id?: string | null; location_name?: string | null },
): Promise<EventStory> {
  const text = body.trim();
  if (!text) throw new Error('Write a short story about what happened.');

  const { data: row, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, metadata')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !row) throw new Error('Event not found.');

  const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}) };
  const stories = Array.isArray(metadata.stories) ? [...(metadata.stories as EventStory[])] : [];
  const story: EventStory = {
    id: randomUUID(),
    body: text,
    created_at: new Date().toISOString(),
    media_url: opts?.media_url ?? null,
    location_id: opts?.location_id ?? null,
    location_name: opts?.location_name ?? null,
  };
  stories.push(story);
  metadata.stories = stories;

  const { error: updateError } = await supabaseAdmin
    .from('resolved_events')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', userId);
  if (updateError) {
    logger.error({ updateError, eventId, userId }, 'user_posted_event: add story failed');
    throw new Error('Could not save that story.');
  }
  return story;
}

export async function addVenueStopToUserPostedEvent(
  userId: string,
  eventId: string,
  stop: { location_id?: string | null; location_name: string; role?: 'afterparty' | 'other' },
): Promise<EventVenueStop[]> {
  const name = stop.location_name.trim();
  if (!name) throw new Error('Name the place.');

  const { data: row, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, metadata, locations')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !row) throw new Error('Event not found.');

  const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}) };
  const venueStops = Array.isArray(metadata.venue_stops)
    ? [...(metadata.venue_stops as EventVenueStop[])]
    : [];
  const next: EventVenueStop = {
    location_id: stop.location_id ?? null,
    location_name: name,
    order: venueStops.length,
    role: stop.role === 'other' ? 'other' : 'afterparty',
  };
  venueStops.push(next);
  metadata.venue_stops = venueStops;

  const existingLocations = Array.isArray(row.locations) ? [...(row.locations as string[])] : [];
  if (stop.location_id && !existingLocations.includes(stop.location_id)) {
    existingLocations.push(stop.location_id);
  } else if (!stop.location_id && !existingLocations.includes(name)) {
    existingLocations.push(name);
  }

  const { error: updateError } = await supabaseAdmin
    .from('resolved_events')
    .update({
      metadata,
      locations: existingLocations,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('user_id', userId);
  if (updateError) {
    logger.error({ updateError, eventId, userId }, 'user_posted_event: add venue failed');
    throw new Error('Could not link that place.');
  }
  return venueStops;
}

export async function listUserPostedEventsForOrganization(
  userId: string,
  organizationId: string,
): Promise<UserPostedEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('*')
    .eq('user_id', userId)
    .eq('metadata->>created_via', 'user_posted')
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(80);
  if (error) {
    logger.warn({ error, userId, organizationId }, 'user_posted_event: list for org failed');
    return [];
  }
  return (data ?? [])
    .filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(meta.organization_ids) ? (meta.organization_ids as unknown[]) : [];
      return ids.some((id) => String(id) === organizationId);
    })
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      summary: (row.summary as string | null) ?? null,
      type: (row.type as string) ?? 'attended_event',
      start_time: (row.start_time as string | null) ?? null,
      locations: Array.isArray(row.locations) ? (row.locations as string[]) : [],
      people: Array.isArray(row.people) ? (row.people as string[]) : [],
      activities: Array.isArray(row.activities) ? (row.activities as string[]) : [],
      confidence: typeof row.confidence === 'number' ? row.confidence : 1,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));
}

export async function listUserPostedEventsForLocation(
  userId: string,
  locationId: string,
  locationName?: string,
): Promise<UserPostedEventRow[]> {
  const nameKey = locationName?.trim().toLowerCase() ?? '';
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('*')
    .eq('user_id', userId)
    .eq('metadata->>created_via', 'user_posted')
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(80);
  if (error) {
    logger.warn({ error, userId, locationId }, 'user_posted_event: list for place failed');
    return [];
  }
  return (data ?? [])
    .filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const primary = meta.primary_place as { id?: string | null; name?: string } | null | undefined;
      if (primary?.id && primary.id === locationId) return true;
      const stops = Array.isArray(meta.venue_stops) ? (meta.venue_stops as EventVenueStop[]) : [];
      if (stops.some((s) => s.location_id === locationId)) return true;
      if (nameKey && primary?.name?.toLowerCase() === nameKey) return true;
      if (nameKey && stops.some((s) => s.location_name.toLowerCase() === nameKey)) return true;
      const locs = Array.isArray(row.locations) ? (row.locations as string[]) : [];
      if (locs.includes(locationId)) return true;
      if (nameKey && locs.some((l) => String(l).toLowerCase() === nameKey)) return true;
      return false;
    })
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      summary: (row.summary as string | null) ?? null,
      type: (row.type as string) ?? 'attended_event',
      start_time: (row.start_time as string | null) ?? null,
      locations: Array.isArray(row.locations) ? (row.locations as string[]) : [],
      people: Array.isArray(row.people) ? (row.people as string[]) : [],
      activities: Array.isArray(row.activities) ? (row.activities as string[]) : [],
      confidence: typeof row.confidence === 'number' ? row.confidence : 1,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));
}

export function isUserPostedEventMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.created_via === 'user_posted';
}
