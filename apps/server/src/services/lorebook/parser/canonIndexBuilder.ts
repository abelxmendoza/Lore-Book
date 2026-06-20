/**
 * Build a LoreBook CanonIndex from in-memory seeds or user cross-book data.
 * Phase 0: read-only assembly — no DB writes.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import {
  buildCrossBookIndexForUser,
  createCrossBookIndex,
} from '../../lexical/projects/projectCrossBookGuard';
import type { CrossBookIndex } from '../../lexical/projects/projectSuggestionTypes';
import type {
  CanonAlias,
  CanonCorrection,
  CanonEntity,
  CanonIndex,
  CanonPendingSuggestion,
  LoreBookDomain,
} from './loreBookParserTypes';

export type CanonSeed = Partial<{
  characters: Array<{ id?: string; name: string; aliases?: string[] }>;
  locations: Array<{ id?: string; name: string; aliases?: string[] }>;
  skills: Array<{ id?: string; name: string; aliases?: string[] }>;
  projects: Array<{ id?: string; name: string; aliases?: string[] }>;
  quests: Array<{ id?: string; name: string; aliases?: string[] }>;
  organizations: Array<{ id?: string; name: string; aliases?: string[] }>;
  groups: Array<{ id?: string; name: string; aliases?: string[] }>;
  schools: Array<{ id?: string; name: string; aliases?: string[] }>;
  work: Array<{ id?: string; name: string; aliases?: string[] }>;
  pendingSuggestions: CanonPendingSuggestion[];
  correctionHistory: CanonCorrection[];
}>;

const DOMAIN_LIST: LoreBookDomain[] = [
  'characters',
  'locations',
  'skills',
  'projects',
  'quests',
  'organizations',
  'groups',
  'relationships',
  'schools',
  'work',
];

function entityTypeForDomain(domain: LoreBookDomain): string {
  switch (domain) {
    case 'characters':
      return 'PERSON';
    case 'locations':
      return 'PLACE';
    case 'skills':
      return 'SKILL';
    case 'projects':
      return 'PROJECT';
    case 'quests':
      return 'TASK';
    case 'organizations':
      return 'ORGANIZATION';
    case 'groups':
      return 'GROUP';
    case 'schools':
      return 'SCHOOL';
    case 'work':
      return 'WORK_CONTEXT';
    case 'relationships':
      return 'RELATIONSHIP';
    case 'events':
      return 'EVENT';
    case 'timeline':
      return 'TIME_PERIOD';
    case 'family':
      return 'FAMILY';
    default:
      return 'UNKNOWN';
  }
}

function rowsToEntities(
  domain: LoreBookDomain,
  rows: Array<{ id?: string; name: string; aliases?: string[] }> | undefined
): CanonEntity[] {
  if (!rows?.length) return [];
  return rows.map((row, idx) => {
    const displayName = row.name.trim();
    const canonicalKey = normalizeNameKey(displayName);
    return {
      id: row.id ?? `${domain}:${canonicalKey || idx}`,
      domain,
      displayName,
      canonicalKey,
      aliases: (row.aliases ?? []).map((a) => a.trim()).filter(Boolean),
      entityType: entityTypeForDomain(domain),
    };
  });
}

function buildAliases(entitiesByDomain: Record<string, CanonEntity[]>): CanonAlias[] {
  const aliases: CanonAlias[] = [];
  for (const domain of DOMAIN_LIST) {
    for (const entity of entitiesByDomain[domain] ?? []) {
      for (const alias of entity.aliases) {
        aliases.push({
          alias,
          canonicalKey: entity.canonicalKey,
          domain,
          entityId: entity.id,
        });
      }
    }
  }
  return aliases;
}

export function buildEmptyCanonIndex(): CanonIndex {
  return {
    characters: [],
    locations: [],
    skills: [],
    projects: [],
    quests: [],
    organizations: [],
    groups: [],
    relationships: [],
    schools: [],
    work: [],
    aliases: [],
    pendingSuggestions: [],
    correctionHistory: [],
  };
}

/** Build canon from fixture seeds or tests — synchronous, no I/O. */
export function buildCanonIndexFromSeed(seed: CanonSeed = {}): CanonIndex {
  const characters = rowsToEntities('characters', seed.characters);
  const locations = rowsToEntities('locations', seed.locations);
  const skills = rowsToEntities('skills', seed.skills);
  const projects = rowsToEntities('projects', seed.projects);
  const quests = rowsToEntities('quests', seed.quests);
  const organizations = rowsToEntities('organizations', seed.organizations);
  const groups = rowsToEntities('groups', seed.groups);
  const schools = rowsToEntities('schools', seed.schools);
  const work = rowsToEntities('work', seed.work);

  const entitiesByDomain: Record<string, CanonEntity[]> = {
    characters,
    locations,
    skills,
    projects,
    quests,
    organizations,
    groups,
    schools,
    work,
  };

  return {
    characters,
    locations,
    skills,
    projects,
    quests,
    organizations,
    groups,
    relationships: [],
    schools,
    work,
    aliases: buildAliases(entitiesByDomain),
    pendingSuggestions: seed.pendingSuggestions ?? [],
    correctionHistory: seed.correctionHistory ?? [],
  };
}

/** Map CrossBookIndex name sets into CanonEntity rows (best-effort, no ids from DB). */
export function canonFromCrossBookIndex(crossBook: CrossBookIndex, seed: CanonSeed = {}): CanonIndex {
  const base = buildCanonIndexFromSeed(seed);

  const append = (domain: LoreBookDomain, names: Set<string>, target: CanonEntity[]) => {
    const seen = new Set(target.map((e) => e.canonicalKey));
    for (const name of names) {
      const key = normalizeNameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      target.push({
        id: `${domain}:${key}`,
        domain,
        displayName: name,
        canonicalKey: key,
        aliases: [],
        entityType: entityTypeForDomain(domain),
      });
    }
  };

  append('characters', crossBook.characters, base.characters);
  append('locations', crossBook.places, base.locations);
  append('organizations', crossBook.organizations, base.organizations);
  append('groups', crossBook.groups, base.groups);
  append('skills', crossBook.skills, base.skills);

  const entitiesByDomain: Record<string, CanonEntity[]> = {
    characters: base.characters,
    locations: base.locations,
    skills: base.skills,
    projects: base.projects,
    quests: base.quests,
    organizations: base.organizations,
    groups: base.groups,
    schools: base.schools,
    work: base.work,
  };
  base.aliases = buildAliases(entitiesByDomain);
  return base;
}

export function createCanonCrossBookIndex(canon: CanonIndex): CrossBookIndex {
  const names = (entities: CanonEntity[]) => entities.map((e) => e.displayName);
  return createCrossBookIndex({
    characters: names(canon.characters),
    places: names(canon.locations),
    organizations: names(canon.organizations),
    groups: names(canon.groups),
    skills: names(canon.skills),
    events: [],
    glossaryAliases: canon.aliases.map((a) => a.alias),
  });
}

/** Async canon load for production paths — read-only. */
export async function buildCanonIndexForUser(userId: string, seed: CanonSeed = {}): Promise<CanonIndex> {
  try {
    const crossBook = await buildCrossBookIndexForUser(userId);
    return canonFromCrossBookIndex(crossBook, seed);
  } catch {
    return buildCanonIndexFromSeed(seed);
  }
}

export function findCanonEntity(
  name: string,
  canon: CanonIndex
): { entity: CanonEntity; matchType: 'exact' | 'alias' } | null {
  const key = normalizeNameKey(name);
  if (!key) return null;

  const allDomains: LoreBookDomain[] = [
    'characters',
    'locations',
    'skills',
    'projects',
    'quests',
    'organizations',
    'groups',
    'schools',
    'work',
    'relationships',
  ];

  for (const domain of allDomains) {
    const list = canon[domain as keyof CanonIndex] as CanonEntity[] | undefined;
    if (!Array.isArray(list)) continue;
    for (const entity of list) {
      if (entity.canonicalKey === key) return { entity, matchType: 'exact' };
      for (const alias of entity.aliases) {
        if (normalizeNameKey(alias) === key) return { entity, matchType: 'alias' };
      }
    }
  }

  for (const alias of canon.aliases) {
    if (normalizeNameKey(alias.alias) === key) {
      const list = canon[alias.domain as keyof CanonIndex] as CanonEntity[] | undefined;
      const entity = list?.find((e) => e.id === alias.entityId);
      if (entity) return { entity, matchType: 'alias' };
    }
  }

  return null;
}

export function canonEntitiesForDomain(canon: CanonIndex, domain: LoreBookDomain): CanonEntity[] {
  const value = canon[domain as keyof CanonIndex];
  return Array.isArray(value) ? (value as CanonEntity[]) : [];
}
