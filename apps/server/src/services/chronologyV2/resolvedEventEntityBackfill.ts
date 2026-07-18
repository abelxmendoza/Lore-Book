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
  const peopleToAdd = matchEntityIdsInText(text, characterRefs).filter((id) => !existingPeople.has(id));
  const locationsToAdd = matchEntityIdsInText(text, locationRefs).filter((id) => !existingLocations.has(id));
  if (peopleToAdd.length === 0 && locationsToAdd.length === 0) return null;
  return { peopleToAdd, locationsToAdd };
}

class ResolvedEventEntityBackfillService {
  async backfillForUser(userId: string, dryRun = true): Promise<EntityBackfillReport> {
    const report: EntityBackfillReport = {
      eventsScanned: 0,
      eventsUpdated: 0,
      peopleAdded: 0,
      locationsAdded: 0,
      samples: [],
    };

    const [charactersRes, locationsRes, eventsRes] = await Promise.all([
      supabaseAdmin.from('characters').select('id, name, alias, metadata').eq('user_id', userId),
      supabaseAdmin.from('locations').select('id, name, aliases').eq('user_id', userId),
      supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, people, locations, metadata')
        .eq('user_id', userId),
    ]);
    if (charactersRes.error) throw charactersRes.error;
    if (locationsRes.error) throw locationsRes.error;
    if (eventsRes.error) throw eventsRes.error;

    const characterRefs: NamedEntityRef[] = (charactersRes.data ?? [])
      .filter((row) => !isSelfCharacterRow(row))
      .map((row) => ({ id: row.id, names: [row.name, ...((row.alias as string[] | null) ?? [])] }));
    const locationRefs: NamedEntityRef[] = (locationsRes.data ?? []).map((row) => ({
      id: row.id,
      names: [row.name, ...((row.aliases as string[] | null) ?? [])],
    }));

    for (const event of eventsRes.data ?? []) {
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

    logger.info({ userId, dryRun, ...report, samples: undefined }, 'entity_backfill: completed');
    return report;
  }
}

export const resolvedEventEntityBackfillService = new ResolvedEventEntityBackfillService();
