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
import { locationAnalyticsService } from './locationAnalyticsService';
import { supabaseAdmin } from './supabaseClient';
import { JOURNAL_COLS } from '../db/journalEntryColumns';

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

        const visitCount = relatedEntries.length;
        const firstVisited = visitCount
          ? relatedEntries.reduce((current, entry) => (entry.date < current ? entry.date : current), relatedEntries[0].date)
          : undefined;
        const lastVisited = visitCount
          ? relatedEntries.reduce((current, entry) => (entry.date > current ? entry.date : current), relatedEntries[0].date)
          : undefined;

        const tagCounts = relatedEntries.reduce<Map<string, number>>((acc, entry) => {
          entry.tags.forEach((tag) => {
            acc.set(tag, (acc.get(tag) ?? 0) + 1);
          });
          return acc;
        }, new Map());

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

        const moodCounts = relatedEntries.reduce<Map<string, number>>((acc, entry) => {
          if (!entry.mood) return acc;
          acc.set(entry.mood, (acc.get(entry.mood) ?? 0) + 1);
          return acc;
        }, new Map());

        const relatedPeople = relatedEntries.reduce<Map<string, { character: CharacterRecord; entryCount: number; relationship_type?: string }>>(
          (acc, entry) => {
            (personMentions.get(entry.id) ?? []).forEach((person) => {
              const character = characterByMention.get(normalizeNameKey(person.name));
              if (!character) return;
              const current = acc.get(character.id) ?? { character, entryCount: 0 };
              current.entryCount += 1;
              acc.set(character.id, current);
            });
            return acc;
          },
          new Map()
        );

        (verifiedLinksByLocation.get(location.id) ?? []).forEach((link) => {
          const character = characterById.get(link.character_id);
          if (!character) return;
          const current = relatedPeople.get(character.id) ?? {
            character,
            entryCount: 0,
            relationship_type: link.relationship_type
          };
          current.entryCount = Math.max(current.entryCount, link.evidence_count ?? 0);
          current.relationship_type = current.relationship_type ?? link.relationship_type;
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
          firstVisited,
          lastVisited,
          coordinates: location.coordinates,
          relatedPeople: Array.from(relatedPeople.values())
            .map(({ character, entryCount, relationship_type }) => ({
              id: character.id,
              character_id: character.id,
              name: character.name,
              total_mentions: this.countCharacterMentions(character.metadata),
              entryCount,
              relationship_type
            }))
            .sort((a, b) => b.entryCount - a.entryCount),
          tagCounts: Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count),
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

    return locations.sort((a, b) => (b.lastVisited ?? '').localeCompare(a.lastVisited ?? ''));
  }

  async getLocationProfile(userId: string, id: string): Promise<LocationProfile | null> {
    const locations = await this.listLocations(userId);
    return locations.find((loc) => loc.id === id) ?? null;
  }

  async updateLocation(
    userId: string,
    locationId: string,
    update: {
      type?: string | null;
      place_tags?: string[];
      place_significance?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<LocationProfile | null> {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('locations')
      .select('id, metadata')
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

    const patch: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (update.type !== undefined) {
      patch.type = update.type;
    }

    const { error } = await supabaseAdmin
      .from('locations')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', locationId);

    if (error) {
      logger.error({ error, locationId }, 'Failed to update location');
      throw error;
    }

    return this.getLocationProfile(userId, locationId);
  }

  /**
   * Delete a location (user-scoped) and clean up its character links so no
   * dangling references remain. Returns false if the row didn't exist.
   */
  async deleteLocation(userId: string, locationId: string): Promise<boolean> {
    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('user_id', userId)
      .eq('id', locationId)
      .maybeSingle();
    if (!existing) return false;

    // Remove links first (best-effort) to avoid orphaned join rows.
    await supabaseAdmin
      .from('location_character_links')
      .delete()
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .then(undefined, (err) => logger.debug({ err, locationId }, 'location link cleanup failed'));

    const { error } = await supabaseAdmin
      .from('locations')
      .delete()
      .eq('user_id', userId)
      .eq('id', locationId);
    if (error) {
      logger.error({ error, locationId }, 'Failed to delete location');
      throw error;
    }
    return true;
  }
}

export const locationService = new LocationService();
