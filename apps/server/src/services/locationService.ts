import { parseISO } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type {
  LocationCoordinates,
  LocationProfile,
  MemoryEntry,
  PeoplePlaceEntity
} from '../types';
import { chapterService } from './chapterService';
import { supabaseAdmin } from './supabaseClient';
import { locationAnalyticsService } from './locationAnalyticsService';

const stringFields = ['location', 'place', 'city', 'venue', 'location_tag'];

type LocationAccumulator = {
  id: string;
  name: string;
  entryIds: Set<string>;
  coordinates: LocationCoordinates | null;
  sources: Set<string>;
};

class LocationService {
  private normalizeKey(name: string) {
    return name.trim().toLowerCase();
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

  private async fetchEntries(userId: string): Promise<MemoryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
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
    fixedId?: string
  ) {
    if (!name.trim()) return;
    const key = this.normalizeKey(name);
    const existing = accumulator.get(key);

    if (existing) {
      if (entryId) existing.entryIds.add(entryId);
      if (coordinates && !existing.coordinates) existing.coordinates = coordinates;
      existing.sources.add(source);
      if (fixedId && existing.id.startsWith('location-')) {
        existing.id = fixedId;
      }
      return;
    }

    accumulator.set(key, {
      id: fixedId ?? `location-${this.slugify(name) || uuid()}`,
      name: name.trim(),
      entryIds: new Set(entryId ? [entryId] : []),
      coordinates: coordinates ?? null,
      sources: new Set([source])
    });
  }

  async listLocations(userId: string): Promise<LocationProfile[]> {
    const [entries, entities, chapters] = await Promise.all([
      this.fetchEntries(userId),
      supabaseAdmin.from('people_places').select('*').eq('user_id', userId),
      chapterService.listChapters(userId)
    ]);

    if (entities.error) {
      logger.error({ error: entities.error }, 'Failed to load places/people for location mapping');
      throw entities.error;
    }

    const chapterTitles = new Map(chapters.map((chapter) => [chapter.id, chapter.title]));
    const peoplePlaces = (entities.data as PeoplePlaceEntity[]) ?? [];
    const personMentions = this.mapPeopleByEntry(peoplePlaces);
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

    const locations: LocationProfile[] = Array.from(accumulator.values()).map((location) => {
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

      const relatedPeople = relatedEntries.reduce<Map<string, { entity: PeoplePlaceEntity; entryCount: number }>>(
        (acc, entry) => {
          (personMentions.get(entry.id) ?? []).forEach((person) => {
            const current = acc.get(person.id) ?? { entity: person, entryCount: 0 };
            current.entryCount += 1;
            acc.set(person.id, current);
          });
          return acc;
        },
        new Map()
      );

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
        visitCount,
        firstVisited,
        lastVisited,
        coordinates: location.coordinates,
        relatedPeople: Array.from(relatedPeople.values())
          .map(({ entity, entryCount }) => ({
            id: entity.id,
            name: entity.name,
            total_mentions: entity.total_mentions,
            entryCount
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
    });

    return locations.sort((a, b) => (b.lastVisited ?? '').localeCompare(a.lastVisited ?? ''));
  }

  async getLocationProfile(userId: string, id: string): Promise<LocationProfile | null> {
    const locations = await this.listLocations(userId);
    return locations.find((loc) => loc.id === id) ?? null;
  }
}

export const locationService = new LocationService();
