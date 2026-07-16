/**
 * Longitudinal evidence retrieval for broad autobiographical queries.
 *
 * "Who am I?" must see the whole timeline, not the newest 200 rows. This
 * pages backward through journal history, then stratifies by quarter so no
 * single busy month (a new job, a festival weekend) crowds out years of
 * foundational material. It also loads the canonical entity roster —
 * characters (with distinct_from separation metadata), organizations, and
 * locations — so the pipeline can resolve mentions and honor collisions.
 */
import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';

import type { KnownEntity } from './narrativeRecords';

const PAGE_SIZE = 1000;
const MAX_PAGES = 4;
const MAX_TOTAL_ENTRIES = 1200;
const MAX_PER_QUARTER = 60;

export interface StoryOfSelfInput {
  entries: MemoryEntry[];
  entities: KnownEntity[];
}

/** Page backward through the full journal history (newest → oldest). */
export async function fetchEntriesAcrossHistory(userId: string): Promise<MemoryEntry[]> {
  const all: MemoryEntry[] = [];
  const seen = new Set<string>();
  let to: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await memoryService.searchEntries(userId, {
      limit: PAGE_SIZE,
      ...(to ? { to } : {}),
    });
    let added = 0;
    for (const entry of batch) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        all.push(entry);
        added++;
      }
    }
    if (batch.length < PAGE_SIZE || added === 0) break;
    const oldest = batch[batch.length - 1]?.date;
    if (!oldest) break;
    to = oldest;
  }
  return all;
}

/**
 * Keep every quarter represented; within a quarter keep the entries most
 * likely to matter (longer, non-chat first) up to a cap.
 */
export function stratifyByQuarter(entries: MemoryEntry[]): MemoryEntry[] {
  if (entries.length <= MAX_TOTAL_ENTRIES) return entries;

  const buckets = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const date = entry.date ?? entry.created_at ?? '';
    const quarter = date ? `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` : 'undated';
    const bucket = buckets.get(quarter) ?? [];
    bucket.push(entry);
    buckets.set(quarter, bucket);
  }

  const kept: MemoryEntry[] = [];
  for (const bucket of buckets.values()) {
    const prioritized = [...bucket].sort((a, b) => {
      const aScore = (a.content?.length ?? 0) + (a.source !== 'chat' ? 500 : 0);
      const bScore = (b.content?.length ?? 0) + (b.source !== 'chat' ? 500 : 0);
      return bScore - aScore;
    });
    kept.push(...prioritized.slice(0, MAX_PER_QUARTER));
  }
  return kept;
}

interface CharacterRow {
  id: string;
  name: string;
  alias: string[] | string | null;
  metadata: Record<string, unknown> | null;
}

function toAliasList(alias: CharacterRow['alias']): string[] {
  if (Array.isArray(alias)) return alias.filter((a): a is string => typeof a === 'string');
  if (typeof alias === 'string' && alias.trim()) return [alias];
  return [];
}

export async function loadKnownEntities(userId: string): Promise<KnownEntity[]> {
  const entities: KnownEntity[] = [];
  try {
    const [charsRes, orgsRes, locsRes] = await Promise.all([
      supabaseAdmin.from('characters').select('id, name, alias, metadata').eq('user_id', userId).limit(1000),
      supabaseAdmin.from('organizations').select('id, name, aliases').eq('user_id', userId).limit(500),
      supabaseAdmin.from('locations').select('id, name, aliases').eq('user_id', userId).limit(500),
    ]);

    for (const row of (charsRes.data ?? []) as CharacterRow[]) {
      const metadata = row.metadata ?? {};
      const distinct = [
        ...((metadata.confirmed_distinct_from as string[]) ?? []),
        ...((metadata.distinct_from as string[]) ?? []),
      ].filter((id): id is string => typeof id === 'string');
      entities.push({
        id: row.id,
        name: row.name,
        aliases: toAliasList(row.alias),
        kind: 'person',
        relationshipRole:
          typeof metadata.relationship === 'string'
            ? metadata.relationship
            : typeof metadata.role === 'string'
              ? (metadata.role as string)
              : undefined,
        distinctFromIds: distinct,
      });
    }

    for (const row of (orgsRes.data ?? []) as { id: string; name: string; aliases: string[] | null }[]) {
      entities.push({
        id: row.id,
        name: row.name,
        aliases: row.aliases ?? [],
        kind: 'organization',
        distinctFromIds: [],
      });
    }

    for (const row of (locsRes.data ?? []) as { id: string; name: string; aliases: string[] | null }[]) {
      entities.push({
        id: row.id,
        name: row.name,
        aliases: row.aliases ?? [],
        kind: 'place',
        distinctFromIds: [],
      });
    }
  } catch (error) {
    logger.warn({ err: error, userId }, 'storyOfSelf: entity roster load failed; proceeding without');
  }
  return entities;
}

/** Full input for a Story of Self run: longitudinal entries + entity roster. */
export async function retrieveStoryOfSelfInput(userId: string): Promise<StoryOfSelfInput> {
  const [entries, entities] = await Promise.all([
    fetchEntriesAcrossHistory(userId),
    loadKnownEntities(userId),
  ]);
  return { entries: stratifyByQuarter(entries), entities };
}
