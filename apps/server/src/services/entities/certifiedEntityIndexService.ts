/**
 * Certified Entity Index — entities with UI cards/modals in the Books.
 * Each entry is addressable by stable UUID and indexed by name + aliases.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

export type CertifiedEntityType = 'character' | 'location' | 'organization' | 'skill' | 'event';

export type CertifiedEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  aliases: string[];
  /** Normalized lowercase keys for fast mention matching */
  mentionKeys: string[];
};

function mentionKeysFor(name: string, aliases: string[]): string[] {
  const keys = new Set<string>();
  const primary = normalizeNameKey(name);
  if (primary) keys.add(primary);
  for (const alias of aliases) {
    const k = normalizeNameKey(alias);
    if (k) keys.add(k);
  }
  return [...keys];
}

function pushEntity(
  map: Map<string, CertifiedEntity>,
  entity: CertifiedEntity
): void {
  const existing = map.get(`${entity.type}:${entity.id}`);
  if (!existing) {
    map.set(`${entity.type}:${entity.id}`, entity);
    return;
  }
  const aliases = new Set([...existing.aliases, ...entity.aliases]);
  const mentionKeys = new Set([...existing.mentionKeys, ...entity.mentionKeys]);
  map.set(`${entity.type}:${entity.id}`, {
    ...existing,
    name: existing.name || entity.name,
    aliases: [...aliases],
    mentionKeys: [...mentionKeys],
  });
}

export async function listCertifiedEntities(userId: string): Promise<CertifiedEntity[]> {
  const map = new Map<string, CertifiedEntity>();

  const [
    identityRows,
    charactersFallback,
    locationsRes,
    orgsRes,
    skillsRes,
    eventsRes,
  ] = await Promise.all([
    Promise.resolve(
      supabaseAdmin
        .from('character_identity_index')
        .select('character_id, mention, mention_key, character:characters(id, name, alias)')
        .eq('user_id', userId)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
    Promise.resolve(
      supabaseAdmin
        .from('characters')
        .select('id, name, alias')
        .eq('user_id', userId)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
    Promise.resolve(
      supabaseAdmin
        .from('locations')
        .select('id, name, metadata')
        .eq('user_id', userId)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
    Promise.resolve(
      supabaseAdmin
        .from('organizations')
        .select('id, name, metadata')
        .eq('user_id', userId)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
    Promise.resolve(
      supabaseAdmin
        .from('skills')
        .select('id, skill_name, metadata')
        .eq('user_id', userId)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
    Promise.resolve(
      supabaseAdmin
        .from('timeline_events')
        .select('id, title, context')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(500)
    )
      .then((r) => r.data ?? [])
      .catch(() => []),
  ]);

  // Characters — prefer identity index (canonical mentions)
  const charAliases = new Map<string, Set<string>>();
  const charNames = new Map<string, string>();
  for (const row of identityRows as Array<{
    character_id: string;
    mention: string;
    character?: { id: string; name: string; alias?: string[] | null };
  }>) {
    if (!row.character_id) continue;
    charNames.set(row.character_id, row.character?.name ?? row.mention);
    const set = charAliases.get(row.character_id) ?? new Set<string>();
    if (row.mention && row.mention !== row.character?.name) set.add(row.mention);
    for (const a of row.character?.alias ?? []) set.add(a);
    charAliases.set(row.character_id, set);
  }
  for (const c of charactersFallback as Array<{ id: string; name: string; alias?: string[] | null }>) {
    if (!charNames.has(c.id)) charNames.set(c.id, c.name);
    const set = charAliases.get(c.id) ?? new Set<string>();
    for (const a of c.alias ?? []) set.add(a);
    charAliases.set(c.id, set);
  }
  for (const [id, name] of charNames) {
    const aliases = [...(charAliases.get(id) ?? [])].filter((a) => a !== name);
    pushEntity(map, {
      id,
      name,
      type: 'character',
      aliases,
      mentionKeys: mentionKeysFor(name, aliases),
    });
  }

  for (const loc of locationsRes as Array<{ id: string; name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (loc.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: loc.id,
      name: loc.name,
      type: 'location',
      aliases,
      mentionKeys: mentionKeysFor(loc.name, aliases),
    });
  }

  for (const org of orgsRes as Array<{ id: string; name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (org.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: org.id,
      name: org.name,
      type: 'organization',
      aliases,
      mentionKeys: mentionKeysFor(org.name, aliases),
    });
  }

  for (const skill of skillsRes as Array<{ id: string; skill_name: string; metadata?: Record<string, unknown> }>) {
    const aliases = (skill.metadata?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: skill.id,
      name: skill.skill_name,
      type: 'skill',
      aliases,
      mentionKeys: mentionKeysFor(skill.skill_name, aliases),
    });
  }

  for (const ev of eventsRes as Array<{ id: string; title: string; context?: Record<string, unknown> }>) {
    const aliases = (ev.context?.aliases as string[] | undefined) ?? [];
    pushEntity(map, {
      id: ev.id,
      name: ev.title,
      type: 'event',
      aliases,
      mentionKeys: mentionKeysFor(ev.title, aliases),
    });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type MatchEntry = {
  entity: CertifiedEntity;
  slot: string;
  fullChecks: Array<{ label: string; pattern: RegExp }>;
  mentionKeys: string[];
};

export type CertifiedEntityMatchIndex = {
  entries: MatchEntry[];
  prefixBuckets: Map<string, number[]>;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/).pop() ?? '';
}

function sortedLabels(entity: CertifiedEntity): string[] {
  return [entity.name, ...entity.aliases]
    .filter((l) => l.length >= 2)
    .sort((a, b) => b.length - a.length);
}

/** Precompile mention patterns — build once per index load. */
export function buildCertifiedEntityMatchIndex(index: CertifiedEntity[]): CertifiedEntityMatchIndex {
  const entries: MatchEntry[] = [];
  const prefixBuckets = new Map<string, number[]>();

  for (const entity of index) {
    const labels = sortedLabels(entity);
    const fullChecks = labels.map((label) => ({
      label,
      pattern: new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'i'),
    }));
    const mentionKeys = entity.mentionKeys?.length
      ? entity.mentionKeys
      : labels.map((l) => normalizeNameKey(l)).filter(Boolean);
    const entryIndex = entries.length;
    entries.push({
      entity,
      slot: `${entity.type}:${entity.id}`,
      fullChecks,
      mentionKeys,
    });

    for (const key of mentionKeys) {
      if (key.length < 2) continue;
      const bucket = key.slice(0, 2);
      const list = prefixBuckets.get(bucket) ?? [];
      if (!list.includes(entryIndex)) list.push(entryIndex);
      prefixBuckets.set(bucket, list);
    }
  }

  return { entries, prefixBuckets };
}

const matchIndexCache = new WeakMap<CertifiedEntity[], CertifiedEntityMatchIndex>();

function getMatchIndex(index: CertifiedEntity[]): CertifiedEntityMatchIndex {
  if (index.length === 0) return buildCertifiedEntityMatchIndex([]);
  let cached = matchIndexCache.get(index);
  if (!cached) {
    cached = buildCertifiedEntityMatchIndex(index);
    matchIndexCache.set(index, cached);
  }
  return cached;
}

export type CertifiedEntityTextMatch = CertifiedEntity & {
  matchedLabel: string;
  matchKind: 'full' | 'prefix';
};

/** Resolve certified entities mentioned in composer text (full + prefix on last token). */
export function matchCertifiedEntitiesInText(
  text: string,
  index: CertifiedEntity[]
): CertifiedEntity[] {
  return matchCertifiedEntitiesInTextDetailed(text, index).map(({ matchedLabel: _l, matchKind: _k, ...entity }) => entity);
}

/** Detailed matches including prefix autocomplete — mirrors client composer chips. */
export function matchCertifiedEntitiesInTextDetailed(
  text: string,
  index: CertifiedEntity[]
): CertifiedEntityTextMatch[] {
  const matchIndex = getMatchIndex(index);
  if (!text.trim() || matchIndex.entries.length === 0) return [];

  const matched = new Map<string, CertifiedEntityTextMatch>();

  for (const entry of matchIndex.entries) {
    for (const { label, pattern } of entry.fullChecks) {
      if (pattern.test(text)) {
        matched.set(entry.slot, {
          ...entry.entity,
          matchedLabel: label,
          matchKind: 'full',
        });
        break;
      }
    }
  }

  const prefix = normalizeNameKey(lastToken(text));
  if (prefix.length >= 2) {
    const bucket = prefix.slice(0, 2);
    const candidates =
      matchIndex.prefixBuckets.get(bucket) ??
      matchIndex.entries.map((_, i) => i);

    for (const entryIndex of candidates) {
      const entry = matchIndex.entries[entryIndex];
      if (matched.has(entry.slot)) continue;

      const keyHit = entry.mentionKeys.some((k) => k.startsWith(prefix));
      const labelHit = entry.fullChecks.some(({ label }) =>
        normalizeNameKey(label).startsWith(prefix)
      );

      if (keyHit || labelHit) {
        matched.set(entry.slot, {
          ...entry.entity,
          matchedLabel: entry.entity.name,
          matchKind: 'prefix',
        });
      }
    }
  }

  return [...matched.values()];
}
