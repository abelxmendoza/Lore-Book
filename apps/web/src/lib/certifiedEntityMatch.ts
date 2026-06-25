/**
 * Client-side entity mention matching for composer chips.
 * Precompiled index for O(candidates) matching instead of per-keystroke RegExp allocation.
 */

import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';

export type { CertifiedEntity, CertifiedEntityType };

export type EntityMatchKind = 'full' | 'prefix';

export type ComposerChipKind =
  | 'entity'
  | 'relationship'
  | 'shared_history'
  | 'needs_clarification'
  | 'growing_entity';

export type CertifiedEntityMatch = CertifiedEntity & {
  matchedLabel: string;
  matchKind?: EntityMatchKind;
  /** Semantic chip from lexical composer parse (relationship, unresolved ref, …). */
  composerChipKind?: ComposerChipKind;
  actionLabel?: string;
};

type MatchEntry = {
  entity: CertifiedEntity;
  slot: string;
  fullChecks: Array<{ label: string; pattern: RegExp }>;
  mentionKeys: string[];
};

export type EntityMatchIndex = {
  entries: MatchEntry[];
  /** First two chars of normalized mention key → entry indices */
  prefixBuckets: Map<string, number[]>;
};

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

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

function mentionKeysFor(entity: CertifiedEntity, labels: string[]): string[] {
  if (entity.mentionKeys?.length) return entity.mentionKeys;
  return labels.map(normalizeNameKey).filter(Boolean);
}

/** Build a reusable match index — call once when the certified index loads. */
export function buildEntityMatchIndex(entities: CertifiedEntity[]): EntityMatchIndex {
  const entries: MatchEntry[] = [];
  const prefixBuckets = new Map<string, number[]>();

  for (const entity of entities) {
    const labels = sortedLabels(entity);
    const fullChecks = labels.map((label) => ({
      label,
      pattern: new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'i'),
    }));
    const mentionKeys = mentionKeysFor(entity, labels);
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

const indexCache = new WeakMap<CertifiedEntity[], EntityMatchIndex>();

export function getEntityMatchIndex(entities: CertifiedEntity[]): EntityMatchIndex {
  if (entities.length === 0) return buildEntityMatchIndex([]);
  let cached = indexCache.get(entities);
  if (!cached) {
    cached = buildEntityMatchIndex(entities);
    indexCache.set(entities, cached);
  }
  return cached;
}

/** Match entities in composer text using a prebuilt index. */
export function matchCertifiedEntitiesWithIndex(
  text: string,
  matchIndex: EntityMatchIndex
): CertifiedEntityMatch[] {
  if (!text.trim() || matchIndex.entries.length === 0) return [];

  const matched = new Map<string, CertifiedEntityMatch>();

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

  return [...matched.values()].sort(sortCertifiedMatches);
}

/** Match entities in composer text — full name mentions + prefix autocomplete on last token. */
export function matchCertifiedEntities(
  text: string,
  index: CertifiedEntity[]
): CertifiedEntityMatch[] {
  return matchCertifiedEntitiesWithIndex(text, getEntityMatchIndex(index));
}

function matchRank(m: CertifiedEntityMatch): number {
  if (m.lifecycleStatus === 'archived') return 4;
  if (m.status === 'draft') return 3;
  if (m.status === 'suggestion') return 2;
  if (m.matchKind === 'prefix') return 1;
  return 0;
}

/** Confirmed full mentions first, then prefix autocomplete, then suggestions. */
export function sortCertifiedMatches(a: CertifiedEntityMatch, b: CertifiedEntityMatch): number {
  const rank = matchRank(a) - matchRank(b);
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name);
}

/** Map entity to chat pipeline thread entity shape (includes skills). */
export function toComposerThreadEntity(
  entity: CertifiedEntity
): { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' } | null {
  if (entity.type === 'event' || entity.type === 'project' || entity.type === 'thing') return null;
  return { id: entity.id, name: entity.name, type: entity.type };
}

export function mergeThreadEntities(
  base: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>,
  composer: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>
): Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }> {
  const map = new Map<string, { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>();
  for (const e of base) map.set(`${e.type}:${e.id}`, e);
  for (const e of composer) map.set(`${e.type}:${e.id}`, e);
  return [...map.values()];
}
