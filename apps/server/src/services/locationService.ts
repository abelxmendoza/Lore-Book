import { parseISO } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type {
  LocationCoordinates,
  LocationProfile,
  MemoryEntry,
  PeoplePlaceEntity
} from '../types';
import { normalizeNameKey, normalizeDuplicateKey } from '../utils/nameNormalization';

import { chapterService } from './chapterService';
import { entityDeletionRecoveryService } from './entityDeletionRecoveryService';
import { locationAnalyticsService } from './locationAnalyticsService';
import {
  classifyPlacePresence,
  classifyTagBucket,
  entryTextBlob,
  hasPlaceParticipation,
} from './locations/placePresenceSemantics';
import { ragPacketCacheService } from './ragPacketCacheService';
import { supabaseAdmin } from './supabaseClient';
import { JOURNAL_COLS } from '../db/journalEntryColumns';

const toTagCounts = (counts: Map<string, number>) =>
  Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

const stringFields = ['location', 'place', 'city', 'venue', 'location_tag'];

type LocationAccumulator = {
  id: string;
  name: string;
  entryIds: Set<string>;
  coordinates: LocationCoordinates | null;
  sources: Set<string>;
  record?: LocationRecord;
};

type CharacterRecord = {
  id: string;
  name: string;
  alias?: string[] | null;
  total_mentions?: number | null;
  metadata?: Record<string, unknown> | null;
};

type LocationRecord = {
  id: string;
  name: string;
  normalized_name?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  owner_operator?: string | null;
  operating_hours?: Record<string, unknown> | null;
  purpose?: string[] | null;
  physical_attributes?: Record<string, unknown> | null;
  reputation?: Record<string, unknown> | null;
  user_relationship?: Record<string, unknown> | null;
  timeline?: unknown[] | null;
  current_state?: Record<string, unknown> | null;
  social_graph?: Record<string, unknown> | null;
  associated_character_ids?: string[] | null;
  root_type?: string | null;
  spatial_category?: string | null;
  spatial_subcategory?: string | null;
  parent_location_id?: string | null;
};

type LocationCharacterLink = {
  location_id: string;
  character_id: string;
  relationship_type: string;
  evidence_count: number | null;
};

class LocationService {
  private normalizeKey(name: string) {
    // Accent- and apostrophe-insensitive so the book collapses the same place
    // across sources (people_places "Moms House" ↔ canonical "Mom's House")
    // into one entry instead of showing both. Canonical id still wins.
    return normalizeDuplicateKey(name);
  }

  private slugify(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  private extractCoordinates(metadata?: Record<string, unknown>): LocationCoordinates | null {
    if (!metadata) return null;

    const candidates = [metadata.gps, metadata.location, metadata.coordinates] as Record<string, unknown>[];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const lat = (candidate as { lat?: unknown; latitude?: unknown }).lat ?? (candidate as { latitude?: unknown }).latitude;
      const lng = (candidate as { lng?: unknown; longitude?: unknown }).lng ?? (candidate as { longitude?: unknown }).longitude;

      if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    return null;
  }

  private extractLocationNames(metadata?: Record<string, unknown>): string[] {
    if (!metadata) return [];

    const names = new Set<string>();

    stringFields.forEach((field) => {
      const value = (metadata as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        names.add(value.trim());
      }
    });

    const locationObject = metadata.location as { name?: unknown } | undefined;
    if (locationObject && typeof locationObject === 'object' && typeof locationObject.name === 'string') {
      names.add(locationObject.name.trim());
    }

    const gpsObject = metadata.gps as { label?: unknown } | undefined;
    if (gpsObject && typeof gpsObject === 'object' && typeof gpsObject.label === 'string') {
      names.add(gpsObject.label.trim());
    }

    return Array.from(names);
  }

  private isMissingSchema(error?: { code?: string; message?: string } | null): boolean {
    return Boolean(
      error &&
        (error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (typeof error.message === 'string' &&
            (error.message.includes('schema cache') ||
              error.message.includes('Could not find the table') ||
              error.message.includes('does not exist'))))
    );
  }

  private coordinatesFromLocation(location: LocationRecord): LocationCoordinates | null {
    if (
      typeof location.latitude === 'number' &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude)
    ) {
      return { lat: location.latitude, lng: location.longitude };
    }
    return null;
  }

  private async fetchCanonicalLocations(userId: string): Promise<LocationRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (this.isMissingSchema(error)) return [];
      logger.error({ error }, 'Failed to load canonical locations');
      throw error;
    }

    return (data ?? []) as LocationRecord[];
  }

  private async fetchCharacters(userId: string): Promise<CharacterRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);

    if (error) {
      logger.error({ error }, 'Failed to load characters for location links');
      throw error;
    }

    return (data ?? []) as CharacterRecord[];
  }

  private async fetchLocationCharacterLinks(userId: string): Promise<LocationCharacterLink[]> {
    const { data, error } = await supabaseAdmin
      .from('location_character_links')
      .select('location_id, character_id, relationship_type, evidence_count')
      .eq('user_id', userId);

    if (error) {
      if (this.isMissingSchema(error)) return [];
      logger.debug({ error }, 'Verified location-character links unavailable');
      return [];
    }

    return (data ?? []) as LocationCharacterLink[];
  }

  private buildCharacterIndex(characters: CharacterRecord[]): Map<string, CharacterRecord> {
    const index = new Map<string, CharacterRecord>();
    characters.forEach((character) => {
      [character.name, ...(Array.isArray(character.alias) ? character.alias : [])].forEach((mention) => {
        const key = normalizeNameKey(mention);
        if (key && !index.has(key)) index.set(key, character);
      });
    });
    return index;
  }

  private countCharacterMentions(metadata?: Record<string, unknown> | null): number {
    const count = Number(metadata?.mention_count);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  private async fetchEntries(userId: string): Promise<MemoryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(500);

    if (error) {
      logger.error({ error }, 'Failed to fetch entries for location mapping');
      throw error;
    }

    return (data as MemoryEntry[]) ?? [];
  }

  private mapPeopleByEntry(entities: PeoplePlaceEntity[]): Map<string, PeoplePlaceEntity[]> {
    const mentions = new Map<string, PeoplePlaceEntity[]>();
    entities
      .filter((entity) => entity.type === 'person')
      .forEach((person) => {
        (person.related_entries ?? []).forEach((entryId) => {
          const existing = mentions.get(entryId) ?? [];
          existing.push(person);
          mentions.set(entryId, existing);
        });
      });
    return mentions;
  }

  private upsertLocation(
    accumulator: Map<string, LocationAccumulator>,
    name: string,
    source: string,
    entryId?: string,
    coordinates?: LocationCoordinates | null,
    fixedId?: string,
    record?: LocationRecord
  ) {
    if (!name.trim()) return;
    const key = this.normalizeKey(name);
    const existing = accumulator.get(key);

    if (existing) {
      if (entryId) existing.entryIds.add(entryId);
      if (coordinates && !existing.coordinates) existing.coordinates = coordinates;
      existing.sources.add(source);
      // Authority rule: the canonical `locations` table (source='registry') is the
      // single id authority. Its id always wins over a people_places id or a
      // synthesized `location-<slug>` id, so the Location Book emits ONE id type
      // (locations.id) whenever a canonical row exists. Non-canonical ids only fill
      // in when no canonical row exists yet. Fixes the merge "authority drift".
      const isCanonical = source === 'registry';
      if (fixedId && (isCanonical || existing.id.startsWith('location-'))) {
        existing.id = fixedId;
      }
      if (record) existing.record = { ...existing.record, ...record };
      return;
    }

    accumulator.set(key, {
      id: fixedId ?? `location-${this.slugify(name) || uuid()}`,
      name: name.trim(),
      entryIds: new Set(entryId ? [entryId] : []),
      coordinates: coordinates ?? null,
      sources: new Set([source]),
      record
    });
  }

  async listLocations(userId: string): Promise<LocationProfile[]> {
    const [entries, entities, chapters, canonicalLocations, characters, locationCharacterLinks] = await Promise.all([
      this.fetchEntries(userId),
      supabaseAdmin.from('people_places').select('*').eq('user_id', userId),
      chapterService.listChapters(userId),
      this.fetchCanonicalLocations(userId),
      this.fetchCharacters(userId),
      this.fetchLocationCharacterLinks(userId)
    ]);

    const isTableMissing = this.isMissingSchema(entities.error);
    if (entities.error && !isTableMissing) {
      logger.error({ error: entities.error }, 'Failed to load places/people for location mapping');
      throw entities.error;
    }

    const chapterTitles = new Map(chapters.map((chapter) => [chapter.id, chapter.title]));
    const peoplePlaces = (isTableMissing ? [] : (entities.data as PeoplePlaceEntity[])) ?? [];
    const personMentions = this.mapPeopleByEntry(peoplePlaces);
    const characterById = new Map(characters.map((character) => [character.id, character]));
    const characterByMention = this.buildCharacterIndex(characters);
    const verifiedLinksByLocation = locationCharacterLinks.reduce<Map<string, LocationCharacterLink[]>>((acc, link) => {
      const links = acc.get(link.location_id) ?? [];
      links.push(link);
      acc.set(link.location_id, links);
      return acc;
    }, new Map());
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
    const accumulator = new Map<string, LocationAccumulator>();

    entries.forEach((entry) => {
      const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
      const locationNames = this.extractLocationNames(metadata);
      const coordinates = this.extractCoordinates(metadata);

      locationNames.forEach((name) => {
        this.upsertLocation(accumulator, name, 'metadata', entry.id, coordinates);
      });
    });

    peoplePlaces
      .filter((entity) => entity.type === 'place')
      .forEach((place) => {
        this.upsertLocation(accumulator, place.name, 'entity', undefined, null, place.id);
        (place.related_entries ?? []).forEach((entryId) => {
          this.upsertLocation(accumulator, place.name, 'entity', entryId, null, place.id);
        });
      });

    canonicalLocations.forEach((location) => {
      this.upsertLocation(
        accumulator,
        location.name,
        'registry',
        undefined,
        this.coordinatesFromLocation(location),
        location.id,
        location
      );
    });

    const locations: LocationProfile[] = await Promise.all(
      Array.from(accumulator.values()).map(async (location) => {
        const relatedEntries = Array.from(location.entryIds)
          .map((id) => entryMap.get(id))
          .filter((entry): entry is MemoryEntry => Boolean(entry));

        const presenceByEntry = relatedEntries.map((entry) => {
          const kind = classifyPlacePresence(location.name, entryTextBlob(entry), {
            source: entry.source,
            hasCoordinates: Boolean(this.extractCoordinates((entry.metadata ?? {}) as Record<string, unknown>)),
          });
          return { entry, kind };
        });
        const visitEntries = presenceByEntry
          .filter((row) => row.kind === 'visit')
          .map((row) => row.entry);
        const attendanceEntries = presenceByEntry
          .filter((row) => row.kind === 'attendance')
          .map((row) => row.entry);

        const mentionCount = relatedEntries.length;
        const visitCount = visitEntries.length;
        const attendanceCount = attendanceEntries.length;
        const minDate = (rows: MemoryEntry[]) =>
          rows.length
            ? rows.reduce((current, entry) => (entry.date < current ? entry.date : current), rows[0].date)
            : undefined;
        const maxDate = (rows: MemoryEntry[]) =>
          rows.length
            ? rows.reduce((current, entry) => (entry.date > current ? entry.date : current), rows[0].date)
            : undefined;

        const firstMentioned = minDate(relatedEntries);
        const lastMentioned = maxDate(relatedEntries);
        const firstVisited = minDate(visitEntries);
        const lastVisited = maxDate(visitEntries);

        const intrinsicTagCounts = new Map<string, number>();
        const visitContextTagCounts = new Map<string, number>();
        const storyTagCounts = new Map<string, number>();
        const placeTags = Array.isArray((location.record?.metadata as { place_tags?: unknown } | undefined)?.place_tags)
          ? ((location.record?.metadata as { place_tags: string[] }).place_tags ?? [])
          : [];
        placeTags.forEach((tag) => {
          if (typeof tag !== 'string' || !tag.trim()) return;
          intrinsicTagCounts.set(tag, (intrinsicTagCounts.get(tag) ?? 0) + 1);
        });

        // Journal tags are situational — never promote them to intrinsic place identity.
        relatedEntries.forEach((entry) => {
          (entry.tags ?? []).forEach((tag) => {
            const bucket = classifyTagBucket(tag);
            const target =
              bucket === 'intrinsic'
                ? intrinsicTagCounts
                : bucket === 'story'
                  ? storyTagCounts
                  : visitContextTagCounts;
            target.set(tag, (target.get(tag) ?? 0) + 1);
          });
        });

        const chapterCounts = relatedEntries.reduce<Map<string, { id: string; title?: string; count: number }>>((acc, entry) => {
          if (!entry.chapter_id) return acc;
          const current = acc.get(entry.chapter_id) ?? {
            id: entry.chapter_id,
            title: chapterTitles.get(entry.chapter_id),
            count: 0
          };
          current.count += 1;
          acc.set(entry.chapter_id, current);
          return acc;
        }, new Map());

        // Moods describe visits/stories, not the place itself — only roll up on visit entries.
        const moodCounts = visitEntries.reduce<Map<string, number>>((acc, entry) => {
          if (!entry.mood) return acc;
          acc.set(entry.mood, (acc.get(entry.mood) ?? 0) + 1);
          return acc;
        }, new Map());

        type RelatedPersonAgg = {
          character: CharacterRecord;
          entryCount: number;
          relationship_type?: string;
          link_kind: 'verified' | 'participated' | 'co_mentioned';
        };
        const relatedPeople = new Map<string, RelatedPersonAgg>();

        relatedEntries.forEach((entry) => {
          const blob = entryTextBlob(entry);
          (personMentions.get(entry.id) ?? []).forEach((person) => {
            const character = characterByMention.get(normalizeNameKey(person.name));
            if (!character) return;
            const participated = hasPlaceParticipation(person.name, location.name, blob);
            const current = relatedPeople.get(character.id) ?? {
              character,
              entryCount: 0,
              link_kind: 'co_mentioned' as const,
            };
            if (participated) {
              current.link_kind = current.link_kind === 'verified' ? 'verified' : 'participated';
              current.entryCount += 1;
            } else if (current.link_kind === 'co_mentioned') {
              // Track co-mentions for diagnostics, but they do not inflate presence counts.
              current.entryCount = Math.max(current.entryCount, 0);
            }
            relatedPeople.set(character.id, current);
          });
        });

        (location.record?.associated_character_ids ?? []).forEach((characterId) => {
          const character = characterById.get(characterId);
          if (!character) return;
          const current = relatedPeople.get(character.id) ?? {
            character,
            entryCount: 0,
            link_kind: 'verified' as const,
          };
          current.link_kind = 'verified';
          current.entryCount = Math.max(current.entryCount, 1);
          relatedPeople.set(character.id, current);
        });

        (verifiedLinksByLocation.get(location.id) ?? []).forEach((link) => {
          const character = characterById.get(link.character_id);
          if (!character) return;
          const current = relatedPeople.get(character.id) ?? {
            character,
            entryCount: 0,
            relationship_type: link.relationship_type,
            link_kind: 'verified' as const,
          };
          current.entryCount = Math.max(current.entryCount, link.evidence_count ?? 0);
          current.relationship_type = current.relationship_type ?? link.relationship_type;
          current.link_kind = 'verified';
          relatedPeople.set(character.id, current);
        });

        const simplifiedEntries = relatedEntries
          .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
          .map((entry) => ({
            id: entry.id,
            date: entry.date,
            tags: entry.tags,
            chapter_id: entry.chapter_id,
            mood: entry.mood,
            summary: entry.summary,
            source: entry.source
          }));

        const locationProfile: LocationProfile = {
          id: location.id,
          name: location.name,
          type: location.record?.type ?? null,
          address: location.record?.address ?? null,
          city: location.record?.city ?? null,
          region: location.record?.region ?? null,
          country: location.record?.country ?? null,
          ownerOperator: location.record?.owner_operator ?? null,
          operatingHours: location.record?.operating_hours ?? {},
          purpose: location.record?.purpose ?? [],
          physicalAttributes: location.record?.physical_attributes ?? {},
          reputation: location.record?.reputation ?? {},
          userRelationship: location.record?.user_relationship ?? {},
          timeline: location.record?.timeline ?? [],
          currentState: location.record?.current_state ?? {},
          socialGraph: location.record?.social_graph ?? {},
          metadata: location.record?.metadata ?? {},
          root_type: location.record?.root_type ?? null,
          spatial_category: location.record?.spatial_category ?? null,
          spatial_subcategory: location.record?.spatial_subcategory ?? null,
          parent_location_id: location.record?.parent_location_id ?? null,
          visitCount,
          mentionCount,
          attendanceCount,
          sourceCount: location.sources.size,
          firstVisited,
          lastVisited,
          firstMentioned,
          lastMentioned,
          coordinates: location.coordinates,
          relatedPeople: Array.from(relatedPeople.values())
            .filter(({ link_kind, entryCount }) => link_kind !== 'co_mentioned' || entryCount > 0)
            .filter(({ link_kind }) => link_kind === 'verified' || link_kind === 'participated')
            .map(({ character, entryCount, relationship_type, link_kind }) => ({
              id: character.id,
              character_id: character.id,
              name: character.name,
              total_mentions: this.countCharacterMentions(character.metadata),
              entryCount,
              relationship_type,
              link_kind,
            }))
            .sort((a, b) => b.entryCount - a.entryCount),
          tagCounts: toTagCounts(visitContextTagCounts),
          intrinsicTags: toTagCounts(intrinsicTagCounts),
          visitContextTags: toTagCounts(visitContextTagCounts),
          storyTags: toTagCounts(storyTagCounts),
          chapters: Array.from(chapterCounts.values()).sort((a, b) => b.count - a.count),
          moods: Array.from(moodCounts.entries())
            .map(([mood, count]) => ({ mood, count }))
            .sort((a, b) => b.count - a.count),
          entries: simplifiedEntries,
          sources: Array.from(location.sources)
        };

        // Calculate analytics (async, don't block)
        try {
          const analytics = await locationAnalyticsService.calculateAnalytics(
            userId,
            location.id,
            locationProfile
          );
          (locationProfile as any).analytics = analytics;
        } catch (error) {
          logger.debug({ error, locationId: location.id }, 'Failed to calculate location analytics, continuing without');
        }

        return locationProfile;
      })
    );

    return locations.sort((a, b) =>
      (b.lastVisited ?? b.lastMentioned ?? '').localeCompare(a.lastVisited ?? a.lastMentioned ?? ''),
    );
  }

  async getLocationProfile(userId: string, id: string): Promise<LocationProfile | null> {
    const locations = await this.listLocations(userId);
    return locations.find((loc) => loc.id === id) ?? null;
  }

  async updateLocation(
    userId: string,
    locationId: string,
    update: {
      name?: string;
      type?: string | null;
      place_tags?: string[];
      place_significance?: string[];
      aliases?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<LocationProfile | null> {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('locations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .eq('id', locationId)
      .maybeSingle();

    if (fetchErr || !existing) {
      throw new Error('Location not found');
    }

    const metadata = {
      ...((existing.metadata ?? {}) as Record<string, unknown>),
      ...(update.metadata ?? {}),
    };
    if (update.place_tags !== undefined) {
      metadata.place_tags = update.place_tags;
    }
    if (update.place_significance !== undefined) {
      metadata.place_significance = update.place_significance;
    }
    if (update.aliases !== undefined) {
      metadata.aliases = [...new Set(update.aliases.map((a) => a.trim()).filter(Boolean))];
      metadata.aliases_source = 'user_confirmed';
    }

    const patch: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (update.name !== undefined) {
      const name = update.name.trim();
      if (!name) throw new Error('Location name is required');
      patch.name = name;
      patch.normalized_name = this.normalizeKey(name);
      metadata.name_source = 'user_confirmed';
      metadata.name_confirmed_at = new Date().toISOString();
      metadata.previous_names = Array.from(new Set([
        ...(
          Array.isArray(metadata.previous_names)
            ? (metadata.previous_names as unknown[]).filter((value): value is string => typeof value === 'string')
            : []
        ),
        existing.name,
      ].filter((value) => normalizeNameKey(value) !== normalizeNameKey(name))));
    }
    if (update.type !== undefined) {
      patch.type = update.type;
    }

    const { error } = await supabaseAdmin
      .from('locations')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', locationId);

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('A location with that name already exists.');
      }
      logger.error({ error, locationId }, 'Failed to update location');
      throw error;
    }

    return this.getLocationProfile(userId, locationId);
  }

  /**
   * Delete a location (user-scoped) and clean up its character links so no
   * dangling references remain. Returns false if the row didn't exist.
   */
  async deleteLocation(
    userId: string,
    locationId: string,
    opts: { reason?: string } = {},
  ): Promise<boolean> {
    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .eq('id', locationId)
      .maybeSingle();
    if (!existing) return false;

    await entityDeletionRecoveryService.runBeforeDelete(userId, {
      entityType: 'location',
      entityId: existing.id as string,
      name: existing.name as string,
      aliases: Array.isArray(existing.metadata?.aliases) ? existing.metadata.aliases as string[] : [],
      metadata: (existing.metadata ?? {}) as Record<string, unknown>,
      omegaEntityId: (existing.metadata as Record<string, unknown> | null)?.omega_entity_id as string | undefined,
      reason: opts.reason ?? 'User deleted place card',
      mode: 'permanent',
    }).catch((err) => logger.warn({ err, locationId }, 'location deletion recovery failed'));

    // Remove links first (best-effort) to avoid orphaned join rows.
    await supabaseAdmin
      .from('location_character_links')
      .delete()
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .then(undefined, (err) => logger.debug({ err, locationId }, 'location link cleanup failed'));

    await supabaseAdmin
      .from('entity_facts')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', 'location')
      .eq('entity_id', locationId)
      .then(undefined, (err) => logger.debug({ err, locationId }, 'location fact cleanup failed'));

    await supabaseAdmin
      .from('entity_conversation_links')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', 'location')
      .eq('entity_id', locationId)
      .then(undefined, (err) => logger.debug({ err, locationId }, 'location conversation link cleanup failed'));

    await supabaseAdmin
      .from('entity_mentions')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', 'location')
      .eq('entity_id', locationId)
      .then(undefined, (err) => logger.debug({ err, locationId }, 'location mention cleanup failed'));

    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('id, locations')
      .eq('user_id', userId)
      .contains('locations', [locationId]);

    for (const event of (events ?? []) as Array<{ id: string; locations: string[] | null }>) {
      await supabaseAdmin
        .from('resolved_events')
        .update({
          locations: (event.locations ?? []).filter((id) => id !== locationId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('user_id', userId)
        .then(undefined, (err) => logger.debug({ err, locationId, eventId: event.id }, 'event location detach failed'));
    }

    const { data: nestedLocations } = await supabaseAdmin
      .from('locations')
      .select('id, parent_location_id, associated_location_ids')
      .eq('user_id', userId)
      .or(`parent_location_id.eq.${locationId},associated_location_ids.cs.{${locationId}}`);

    for (const nested of (nestedLocations ?? []) as Array<{
      id: string;
      parent_location_id: string | null;
      associated_location_ids: string[] | null;
    }>) {
      await supabaseAdmin
        .from('locations')
        .update({
          parent_location_id: nested.parent_location_id === locationId ? null : nested.parent_location_id,
          associated_location_ids: (nested.associated_location_ids ?? []).filter((id) => id !== locationId),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', nested.id)
        .then(undefined, (err) => logger.debug({ err, locationId, nestedLocationId: nested.id }, 'nested location cleanup failed'));
    }

    const { error } = await supabaseAdmin
      .from('locations')
      .delete()
      .eq('user_id', userId)
      .eq('id', locationId);
    if (error) {
      logger.error({ error, locationId }, 'Failed to delete location');
      throw error;
    }
    ragPacketCacheService.invalidateLoreCache(userId);
    ragPacketCacheService.clearUserCache(userId);
    return true;
  }
}

export const locationService = new LocationService();
