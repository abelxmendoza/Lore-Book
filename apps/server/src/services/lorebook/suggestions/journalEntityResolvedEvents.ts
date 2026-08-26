/**
 * Promote dated journal entries that already name a book entity into
 * resolved_events. Does not invent biography — title/summary come from the
 * journal, and entity links reuse the same matchers as suggestion hydrate.
 */

import { randomUUID } from 'crypto';

import { logger } from '../../../logger';
import { isSelfCharacterRow } from '../../identity/selfIdentityGuard';
import {
  planEntityBackfill,
  type NamedEntityRef,
} from '../../chronologyV2/resolvedEventEntityBackfill';
import {
  eventAcceptedForOrganization,
  planUserOrganizationAttributionBackfill,
  readOrganizationAttributions,
  type OrganizationCatalogEntry,
} from '../../organizations/organizationEventAttribution';
import { loadOrganizationCatalog } from '../../organizations/organizationEventAttributionService';
import { supabaseAdmin } from '../../supabaseClient';

const JOURNAL_PAGE = 200;
const EVENT_PAGE = 1000;
const MIN_CONTENT_LENGTH = 20;

export type JournalResolvedEventPlan = {
  title: string;
  summary: string;
  people: string[];
  locations: string[];
  metadata: Record<string, unknown>;
};

export type JournalResolvedEventReport = {
  journalsScanned: number;
  eventsCreated: number;
  skipped: number;
};

function journalTitle(summary: string | null, content: string): string {
  const fromSummary = summary?.trim();
  if (fromSummary) return fromSummary.slice(0, 120);
  const firstLine = content.trim().split('\n')[0]?.trim() ?? '';
  if (firstLine.length >= 8) return firstLine.slice(0, 120);
  return 'Journal moment';
}

export function planJournalResolvedEvent(input: {
  content: string;
  summary: string | null;
  occurredOn: string | null;
  linkedCharacterIds: string[];
  characterRefs: NamedEntityRef[];
  locationRefs: NamedEntityRef[];
  orgCatalog: OrganizationCatalogEntry[];
}): JournalResolvedEventPlan | null {
  if (!input.occurredOn?.trim()) return null;
  const content = input.content.trim();
  if (content.length < MIN_CONTENT_LENGTH) return null;

  const text = `${input.summary ?? ''} ${content}`;
  const entityPlan = planEntityBackfill(
    { title: input.summary, summary: content, people: input.linkedCharacterIds, locations: [] },
    input.characterRefs,
    input.locationRefs,
  );
  const people = [...new Set([
    ...input.linkedCharacterIds,
    ...(entityPlan?.peopleToAdd ?? []),
  ])];
  const locations = entityPlan?.locationsToAdd ?? [];
  const orgMetadata = planUserOrganizationAttributionBackfill({
    text,
    catalog: input.orgCatalog,
  });
  const orgRows = readOrganizationAttributions(orgMetadata);
  const hasOrgTimeline = orgRows.some((row) =>
    row.organizationId ? eventAcceptedForOrganization(orgRows, row.organizationId) : false,
  );

  if (people.length === 0 && locations.length === 0 && !hasOrgTimeline) return null;

  return {
    title: journalTitle(input.summary, content),
    summary: content.slice(0, 400),
    people,
    locations,
    metadata: {
      generated_by: 'journal_entity_hydrate',
      ...(orgMetadata ?? {}),
    },
  };
}

async function loadExistingJournalSourceIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; offset < 10_000; offset += EVENT_PAGE) {
    const { data, error } = await supabaseAdmin
      .from('resolved_events')
      .select('metadata')
      .eq('user_id', userId)
      .range(offset, offset + EVENT_PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const sourceId = (row.metadata as Record<string, unknown> | null)?.source_entry_id;
      if (typeof sourceId === 'string' && sourceId) ids.add(sourceId);
    }
    if (rows.length < EVENT_PAGE) break;
  }
  return ids;
}

export async function promoteDatedJournalsToResolvedEvents(
  userId: string,
  opts?: { dryRun?: boolean },
): Promise<JournalResolvedEventReport> {
  const dryRun = opts?.dryRun ?? true;
  const report: JournalResolvedEventReport = {
    journalsScanned: 0,
    eventsCreated: 0,
    skipped: 0,
  };

  const [charactersRes, locationsRes, memLinks, catalog, existingSources] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name, alias, metadata').eq('user_id', userId),
    supabaseAdmin.from('locations').select('id, name, aliases').eq('user_id', userId),
    supabaseAdmin.from('character_memories').select('character_id, journal_entry_id').eq('user_id', userId),
    loadOrganizationCatalog(userId),
    loadExistingJournalSourceIds(userId),
  ]);
  if (charactersRes.error) throw charactersRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (memLinks.error) throw memLinks.error;

  const characterRefs: NamedEntityRef[] = (charactersRes.data ?? [])
    .filter((row) => !isSelfCharacterRow(row))
    .map((row) => ({ id: row.id, names: [row.name, ...((row.alias as string[] | null) ?? [])] }));
  const locationRefs: NamedEntityRef[] = (locationsRes.data ?? []).map((row) => ({
    id: row.id,
    names: [row.name, ...((row.aliases as string[] | null) ?? [])],
  }));
  const linkedByJournal = new Map<string, string[]>();
  for (const link of memLinks.data ?? []) {
    const journalId = link.journal_entry_id as string;
    const characterId = link.character_id as string;
    if (!journalId || !characterId) continue;
    const list = linkedByJournal.get(journalId) ?? [];
    list.push(characterId);
    linkedByJournal.set(journalId, list);
  }

  for (let offset = 0; offset < 5_000; offset += JOURNAL_PAGE) {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content, summary')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .range(offset, offset + JOURNAL_PAGE - 1);
    if (error) throw error;
    const journals = data ?? [];
    for (const journal of journals) {
      report.journalsScanned += 1;
      if (existingSources.has(journal.id)) {
        report.skipped += 1;
        continue;
      }
      const allowedPeople = new Set(characterRefs.map((ref) => ref.id));
      const plan = planJournalResolvedEvent({
        content: journal.content ?? '',
        summary: (journal.summary as string | null) ?? null,
        occurredOn: (journal.date as string | null) ?? null,
        linkedCharacterIds: (linkedByJournal.get(journal.id) ?? []).filter((id) => allowedPeople.has(id)),
        characterRefs,
        locationRefs,
        orgCatalog: catalog,
      });
      if (!plan) {
        report.skipped += 1;
        continue;
      }
      report.eventsCreated += 1;
      if (dryRun) continue;

      const { error: insertError } = await supabaseAdmin.from('resolved_events').insert({
        id: randomUUID(),
        user_id: userId,
        title: plan.title,
        summary: plan.summary,
        type: 'life_context',
        start_time: journal.date,
        confidence: 0.8,
        people: plan.people,
        locations: plan.locations,
        metadata: {
          ...plan.metadata,
          source_entry_id: journal.id,
        },
      });
      if (insertError) {
        logger.warn({ error: insertError }, 'journal entity hydrate: insert failed');
        report.eventsCreated -= 1;
        report.skipped += 1;
        continue;
      }
      existingSources.add(journal.id);
    }
    if (journals.length < JOURNAL_PAGE) break;
  }

  logger.info(
    {
      dryRun,
      journalsScanned: report.journalsScanned,
      eventsCreated: report.eventsCreated,
      skipped: report.skipped,
    },
    'journal entity hydrate: completed',
  );
  return report;
}
