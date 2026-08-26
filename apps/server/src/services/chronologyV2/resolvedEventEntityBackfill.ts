/**
 * Backfill resolved_events.people / .locations for legacy rows.
 *
 * Old writers left the entity arrays empty (and an earlier people
 * canonicalization pass emptied arrays whose refs could not be mapped), which
 * starves both cohesion scoring and event canonicalization of their strongest
 * signals. This pass matches known canonical entity names — characters
 * (name + alias) and locations (name + aliases) — against each event's
 * title + summary and adds the canonical ids. Strictly additive: existing ids
 * are never removed, and the self character never becomes a participant of
 * their own events (they are omnipresent, so they carry no discriminating
 * signal).
 */

import { logger } from '../../logger';
import { isSelfCharacterRow } from '../identity/selfIdentityGuard';
import { supabaseAdmin } from '../supabaseClient';
import { classifyPersonAttribution, classifyPlaceAttribution } from '../attribution/eventEntityAttribution';

export interface NamedEntityRef {
  id: string;
  names: Array<string | null | undefined>;
}

export interface EntityBackfillPlan {
  peopleToAdd: string[];
  locationsToAdd: string[];
}

export interface EntityBackfillReport {
  eventsScanned: number;
  eventsUpdated: number;
  peopleAdded: number;
  locationsAdded: number;
  samples: Array<{ title: string; peopleAdded: string[]; locationsAdded: string[] }>;
}

const MIN_NAME_LENGTH = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Canonical entity ids whose name or any alias appears in the text. */
export function matchEntityIdsInText(text: string, refs: NamedEntityRef[]): string[] {
  if (!text.trim()) return [];
  const matched: string[] = [];
  for (const ref of refs) {
    const hit = ref.names.some((name) => {
      const trimmed = (name ?? '').trim();
      if (trimmed.length < MIN_NAME_LENGTH) return false;
      // \b only exists next to a word character — names that start or end
      // with punctuation ("Nell's Porch (back)") anchor on their word edges.
      const prefix = /^\w/.test(trimmed) ? '\\b' : '';
      const suffix = /\w$/.test(trimmed) ? '\\b' : '';
      return new RegExp(`${prefix}${escapeRegExp(trimmed)}${suffix}`, 'i').test(text);
    });
    if (hit && !matched.includes(ref.id)) matched.push(ref.id);
  }
  return matched;
}

/** Additive plan for one event, or null when nothing new matches. */
export function planEntityBackfill(
  event: { title: string | null; summary: string | null; people: string[] | null; locations: string[] | null },
  characterRefs: NamedEntityRef[],
  locationRefs: NamedEntityRef[],
): EntityBackfillPlan | null {
  const text = `${event.title ?? ''} ${event.summary ?? ''}`;
  const existingPeople = new Set(event.people ?? []);
  const existingLocations = new Set(event.locations ?? []);
  const peopleToAdd = matchEntityIdsInText(text, characterRefs).filter((id) => {
    if (existingPeople.has(id)) return false;
    const ref = characterRefs.find((row) => row.id === id);
    const names = (ref?.names ?? []).filter((name): name is string => Boolean(name && name.trim()));
    if (names.length === 0) return false;
    return classifyPersonAttribution(names[0]!, text, { entityId: id, aliases: names.slice(1) }).canonical;
  });
  const locationsToAdd = matchEntityIdsInText(text, locationRefs).filter((id) => {
    if (existingLocations.has(id)) return false;
    const ref = locationRefs.find((row) => row.id === id);
    const names = (ref?.names ?? []).filter((name): name is string => Boolean(name && name.trim()));
    if (names.length === 0) return false;
    return classifyPlaceAttribution(names[0]!, text, { entityId: id, aliases: names.slice(1) }).canonical;
  });
  if (peopleToAdd.length === 0 && locationsToAdd.length === 0) return null;
  return { peopleToAdd, locationsToAdd };
}

const ENTITY_PAGE = 1000;
const USER_WIDE_EVENT_CAP = 10_000;
const SUGGESTION_EVENT_CAP = 1500;

async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = ENTITY_PAGE,
  cap = USER_WIDE_EVENT_CAP,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

class ResolvedEventEntityBackfillService {
  /**
   * Scoped additive backfill for one newly accepted character or place.
   * Writes immediately (not a dry-run script).
   */
  async backfillForEntity(
    userId: string,
    entity: { kind: 'character' | 'location'; id: string },
  ): Promise<EntityBackfillReport> {
    const empty: EntityBackfillReport = {
      eventsScanned: 0,
      eventsUpdated: 0,
      peopleAdded: 0,
      locationsAdded: 0,
      samples: [],
    };
    if (entity.kind === 'character') {
      const { data, error } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias, metadata')
        .eq('user_id', userId)
        .eq('id', entity.id)
        .maybeSingle();
      if (error || !data || isSelfCharacterRow(data)) return empty;
      return this.applyBackfill(
        userId,
        [{ id: data.id, names: [data.name, ...((data.alias as string[] | null) ?? [])] }],
        [],
        false,
      );
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, aliases')
      .eq('user_id', userId)
      .eq('id', entity.id)
      .maybeSingle();
    if (error || !data) return empty;
    return this.applyBackfill(
      userId,
      [],
      [{ id: data.id, names: [data.name, ...((data.aliases as string[] | null) ?? [])] }],
      false,
    );
  }

  async backfillForUser(userId: string, dryRun = true): Promise<EntityBackfillReport> {
    const [characters, locations] = await Promise.all([
      selectAllPages<{ id: string; name: string; alias: string[] | null; metadata: Record<string, unknown> | null }>(
        (from, to) =>
          supabaseAdmin
            .from('characters')
            .select('id, name, alias, metadata')
            .eq('user_id', userId)
            .range(from, to),
        ENTITY_PAGE,
        5_000,
      ),
      selectAllPages<{ id: string; name: string; aliases: string[] | null }>(
        (from, to) =>
          supabaseAdmin
            .from('locations')
            .select('id, name, aliases')
            .eq('user_id', userId)
            .range(from, to),
        ENTITY_PAGE,
        5_000,
      ),
    ]);

    const characterRefs: NamedEntityRef[] = characters
      .filter((row) => !isSelfCharacterRow(row))
      .map((row) => ({ id: row.id, names: [row.name, ...((row.alias as string[] | null) ?? [])] }));
    const locationRefs: NamedEntityRef[] = locations.map((row) => ({
      id: row.id,
      names: [row.name, ...((row.aliases as string[] | null) ?? [])],
    }));

    const report: EntityBackfillReport = {
      eventsScanned: 0,
      eventsUpdated: 0,
      peopleAdded: 0,
      locationsAdded: 0,
      samples: [],
    };

    for (let offset = 0; offset < USER_WIDE_EVENT_CAP; offset += ENTITY_PAGE) {
      const { data, error } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, people, locations, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + ENTITY_PAGE - 1);
      if (error) throw error;
      const events = data ?? [];
      const pageReport = await this.applyBackfill(userId, characterRefs, locationRefs, dryRun, events);
      report.eventsScanned += pageReport.eventsScanned;
      report.eventsUpdated += pageReport.eventsUpdated;
      report.peopleAdded += pageReport.peopleAdded;
      report.locationsAdded += pageReport.locationsAdded;
      if (report.samples.length < 20) {
        report.samples.push(...pageReport.samples.slice(0, 20 - report.samples.length));
      }
      if (events.length < ENTITY_PAGE) break;
    }

    logger.info({ dryRun, ...report, samples: undefined }, 'entity_backfill: completed');
    return report;
  }

  private async applyBackfill(
    userId: string,
    characterRefs: NamedEntityRef[],
    locationRefs: NamedEntityRef[],
    dryRun: boolean,
    preloadedEvents?: Array<{
      id: string;
      title: string | null;
      summary: string | null;
      people: string[] | null;
      locations: string[] | null;
      metadata: Record<string, unknown> | null;
    }>,
  ): Promise<EntityBackfillReport> {
    const report: EntityBackfillReport = {
      eventsScanned: 0,
      eventsUpdated: 0,
      peopleAdded: 0,
      locationsAdded: 0,
      samples: [],
    };

    let events = preloadedEvents;
    if (!events) {
      const eventsRes = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, people, locations, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(SUGGESTION_EVENT_CAP);
      if (eventsRes.error) throw eventsRes.error;
      events = eventsRes.data ?? [];
    }

    for (const event of events) {
      report.eventsScanned++;
      const plan = planEntityBackfill(event, characterRefs, locationRefs);
      if (!plan) continue;

      report.eventsUpdated++;
      report.peopleAdded += plan.peopleToAdd.length;
      report.locationsAdded += plan.locationsToAdd.length;
      if (report.samples.length < 20) {
        report.samples.push({
          title: event.title ?? '',
          peopleAdded: plan.peopleToAdd,
          locationsAdded: plan.locationsToAdd,
        });
      }

      if (dryRun) continue;

      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin
        .from('resolved_events')
        .update({
          people: [...new Set([...(event.people ?? []), ...plan.peopleToAdd])],
          locations: [...new Set([...(event.locations ?? []), ...plan.locationsToAdd])],
          metadata: {
            ...metadata,
            entity_backfill: {
              at: new Date().toISOString(),
              people_added: plan.peopleToAdd.length,
              locations_added: plan.locationsToAdd.length,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
        .eq('user_id', userId);
      if (error) {
        logger.error({ error, eventId: event.id }, 'entity_backfill: update failed');
        throw error;
      }
    }

    return report;
  }
}

export const resolvedEventEntityBackfillService = new ResolvedEventEntityBackfillService();
