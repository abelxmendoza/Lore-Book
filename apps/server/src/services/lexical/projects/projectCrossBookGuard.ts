/**
 * Reject project candidates already known in other LoreBook indexes (person, place, org, etc.).
 * Known non-project identity beats lexical project guessing.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { supabaseAdmin } from '../../supabaseClient';
import { glossaryAliases } from '../../ontology/glossary';
import { KNOWN_PROJECT_ALIASES, type CrossBookIndex, type ProjectSuggestionOptions } from './projectSuggestionTypes';

export type CrossBookGuardResult = {
  allowed: boolean;
  rejectedAs?: string;
  rejectionReason?: string;
  rulesFired: string[];
};

const norm = (s: string) => normalizeNameKey(s);

function isKnownProject(span: string, options?: ProjectSuggestionOptions): boolean {
  const key = norm(span);
  const alias = KNOWN_PROJECT_ALIASES.get(key);
  const compare = alias ? norm(alias) : key;
  if (!options?.knownProjects?.size) return false;
  for (const known of options.knownProjects) {
    if (norm(known) === compare) return true;
  }
  return false;
}

function inSet(span: string, set?: Set<string>): boolean {
  if (!set?.size) return false;
  const key = norm(span);
  if (set.has(key)) return true;
  for (const entry of set) {
    if (norm(entry) === key) return true;
  }
  return false;
}

export function guardCrossBookEntity(
  span: string,
  contextLine: string,
  index?: CrossBookIndex,
  options?: ProjectSuggestionOptions
): CrossBookGuardResult {
  const rulesFired: string[] = [];
  const text = span.trim();
  if (!text) return { allowed: true, rulesFired: ['empty_span'] };

  if (isKnownProject(text, options)) {
    rulesFired.push('known_project_rescue');
    return { allowed: true, rulesFired };
  }

  if (!index) return { allowed: true, rulesFired: ['no_cross_book_index'] };

  if (inSet(text, index.characters) || inSet(text, index.glossaryAliases)) {
    return {
      allowed: false,
      rejectedAs: 'PERSON',
      rejectionReason: 'known_as_person',
      rulesFired: ['cross_book_person'],
    };
  }

  if (inSet(text, index.places)) {
    return {
      allowed: false,
      rejectedAs: 'PLACE',
      rejectionReason: 'known_as_place',
      rulesFired: ['cross_book_place'],
    };
  }

  if (inSet(text, index.organizations)) {
    return {
      allowed: false,
      rejectedAs: 'ORGANIZATION',
      rejectionReason: 'known_as_organization',
      rulesFired: ['cross_book_organization'],
    };
  }

  if (inSet(text, index.groups)) {
    return {
      allowed: false,
      rejectedAs: 'GROUP',
      rejectionReason: 'known_as_group',
      rulesFired: ['cross_book_group'],
    };
  }

  if (inSet(text, index.skills)) {
    return {
      allowed: false,
      rejectedAs: 'SKILL',
      rejectionReason: 'known_as_skill',
      rulesFired: ['cross_book_skill'],
    };
  }

  if (inSet(text, index.events)) {
    return {
      allowed: false,
      rejectedAs: 'EVENT',
      rejectionReason: 'known_as_event',
      rulesFired: ['cross_book_event'],
    };
  }

  void contextLine;
  return { allowed: true, rulesFired: ['cross_book_clear'] };
}

export function createCrossBookIndex(partial: Partial<Record<keyof CrossBookIndex, Iterable<string>>>): CrossBookIndex {
  const toSet = (items?: Iterable<string>) => new Set([...(items ?? [])].map(norm).filter(Boolean));
  return {
    characters: toSet(partial.characters),
    places: toSet(partial.places),
    organizations: toSet(partial.organizations),
    groups: toSet(partial.groups),
    skills: toSet(partial.skills),
    events: toSet(partial.events),
    glossaryAliases: toSet(partial.glossaryAliases),
  };
}

/** Load LoreBook entity indexes for cross-book project guard (async, best-effort). */
export async function buildCrossBookIndexForUser(userId: string): Promise<CrossBookIndex> {
  const characters: string[] = [];
  const places: string[] = [];
  const organizations: string[] = [];
  const groups: string[] = [];
  const skills: string[] = [];
  const events: string[] = [];
  const glossaryAliasNames: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('name, alias')
      .eq('user_id', userId);
    for (const row of data ?? []) {
      const name = String(row.name ?? '').trim();
      if (name) characters.push(name);
      const aliasList = Array.isArray(row.alias) ? row.alias : [];
      for (const alias of aliasList) {
        const a = String(alias ?? '').trim();
        if (a) characters.push(a);
      }
    }
  } catch {
    // characters table may be absent in test env
  }

  try {
    const { data } = await supabaseAdmin
      .from('locations')
      .select('name, aliases')
      .eq('user_id', userId);
    for (const row of data ?? []) {
      const name = String(row.name ?? '').trim();
      if (name) places.push(name);
      for (const nickname of row.aliases ?? []) {
        const n = String(nickname ?? '').trim();
        if (n) places.push(n);
      }
    }
  } catch {
    // locations optional
  }

  try {
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('name, aliases, type')
      .eq('user_id', userId);
    for (const row of data ?? []) {
      const name = String(row.name ?? '').trim();
      if (!name) continue;
      const type = String(row.type ?? '').toLowerCase();
      const aliases = (row.aliases ?? []).map((a: unknown) => String(a ?? '').trim()).filter(Boolean);
      if (/club|group|team|class|band|crew/.test(type)) {
        groups.push(name, ...aliases);
      } else {
        organizations.push(name, ...aliases);
      }
    }
  } catch {
    // organizations optional
  }

  try {
    const { data } = await supabaseAdmin
      .from('skills')
      .select('skill_name')
      .eq('user_id', userId);
    for (const row of data ?? []) {
      const name = String(row.skill_name ?? '').trim();
      if (name) skills.push(name);
    }
  } catch {
    // skills optional
  }

  try {
    const { data } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_title')
      .eq('user_id', userId)
      .limit(500);
    for (const row of data ?? []) {
      const title = String(row.event_title ?? '').trim();
      if (title) events.push(title);
    }
  } catch {
    // timeline events optional
  }

  for (const { alias, entry } of glossaryAliases()) {
    if (entry.domain === 'PERSON' || entry.domain === 'FAMILY') {
      glossaryAliasNames.push(alias);
    }
  }

  return createCrossBookIndex({
    characters,
    places,
    organizations,
    groups,
    skills,
    events,
    glossaryAliases: glossaryAliasNames,
  });
}
