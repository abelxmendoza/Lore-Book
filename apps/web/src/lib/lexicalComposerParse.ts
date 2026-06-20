/**
 * Deterministic composer lexical parse — mirrors server lexical intelligence for
 * inline chips (person, place, relationship, shared history, unresolved refs).
 */

import type { CertifiedEntity } from '../types/certifiedEntity';
import type { CertifiedEntityMatch, ComposerChipKind } from './certifiedEntityMatch';
import { isIndividualPersonName } from './personNameValidation';

export type ComposerLexicalEntity = {
  type: 'PERSON' | 'PLACE' | 'SCHOOL';
  value: string;
  category?: string;
  needs_resolution?: boolean;
};

export type ComposerLexicalRelationship = {
  subject: string;
  relationship: string;
  object: 'self' | string;
};

export type ComposerLexicalEvent = {
  type: string;
  people: string[];
  place?: string | null;
  school_name?: string | null;
  needs_clarification?: boolean;
};

export type ComposerLexicalReference = {
  pronoun?: string;
  phrase?: string;
  refers_to: string;
};

export type ComposerLexicalParse = {
  entities: ComposerLexicalEntity[];
  relationships: ComposerLexicalRelationship[];
  events: ComposerLexicalEvent[];
  references: ComposerLexicalReference[];
  ambiguities: string[];
  memoryCandidates: string[];
  actionChips: string[];
};

const BLOCKED_PLACE_TOKENS = new Set([
  'friend', 'friends', 'school', 'same', 'me', 'he', 'she', 'they', 'it', 'the',
  'and', 'at', 'my', 'our', 'his', 'her', 'their', 'who', 'what', 'when', 'where',
]);

const GENERIC_VENUE_WORDS = new Set([
  'school', 'university', 'college', 'campus', 'classroom', 'gym', 'dojo', 'bar',
  'restaurant', 'cafe', 'office', 'home', 'house', 'city', 'park',
]);

const SENTENCE_VERB_PREFIX = new Set([
  'tell', 'ask', 'say', 'call', 'email', 'text', 'message', 'ping', 'remind', 'show', 'give',
]);

function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeNameKey(name: string): string {
  return norm(name);
}

function dedupeEntities(entities: ComposerLexicalEntity[]): ComposerLexicalEntity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.type}:${norm(e.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPrimaryPerson(text: string): string | null {
  const patterns = [
    /\b([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)+)\s+is\s+my\s+friend\b/,
    /\b([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)+)\s+is\s+(?:a|my)\s+(?:close\s+)?friend\b/i,
    /\bmy\s+friend\s+([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)+)\b/,
    /\b([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const name = m?.[1]?.trim();
    if (!name || !isIndividualPersonName(name)) continue;
    const first = norm(name.split(/\s+/)[0] ?? '');
    if (SENTENCE_VERB_PREFIX.has(first)) continue;
    return name;
  }
  return null;
}

function extractCities(text: string): string[] {
  const cities: string[] = [];
  const re = /\b(?:in|from|near|around|grew up in|lived in|based in)\s+([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1].trim().replace(/[,.]$/, '');
    const key = norm(candidate);
    if (BLOCKED_PLACE_TOKENS.has(key)) continue;
    if (GENERIC_VENUE_WORDS.has(key)) continue;
    if (!isIndividualPersonName(candidate) && candidate.length >= 3) {
      cities.push(candidate);
      continue;
    }
    if (isIndividualPersonName(candidate) && /\b(?:in|from|near|around)\s+[A-Z]/.test(m[0])) {
      // "in Anaheim" style — single token city names pass through
      if (!candidate.includes(' ')) cities.push(candidate);
    }
  }
  return [...new Set(cities.map(titleCase))];
}

function hasSameSchoolReference(text: string): boolean {
  return /\b(?:the\s+)?same\s+school\b/i.test(text);
}

function hasGrewUpTogether(text: string): boolean {
  return /\b(?:we\s+)?(?:gre\s+up|grew\s+up)\s+together\b/i.test(text);
}

function hasFriendship(text: string, person: string | null): boolean {
  if (!person) return /\bis\s+my\s+friend\b/i.test(text) || /\bmy\s+friend\b/i.test(text);
  return new RegExp(`\\b${person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+is\\s+my\\s+friend\\b`, 'i').test(text)
    || /\bis\s+my\s+friend\b/i.test(text);
}

/** Full deterministic parse for composer / demo lexical preview. */
export function parseComposerLexical(text: string): ComposerLexicalParse {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      entities: [],
      relationships: [],
      events: [],
      references: [],
      ambiguities: [],
      memoryCandidates: [],
      actionChips: [],
    };
  }

  const person = extractPrimaryPerson(trimmed);
  const cities = extractCities(trimmed);
  const entities: ComposerLexicalEntity[] = [];
  const relationships: ComposerLexicalRelationship[] = [];
  const events: ComposerLexicalEvent[] = [];
  const references: ComposerLexicalReference[] = [];
  const ambiguities: string[] = [];
  const memoryCandidates: string[] = [];
  const actionChips: string[] = [];

  if (person) {
    entities.push({ type: 'PERSON', value: person });
    actionChips.push(`Add person: ${person}`);
  }

  for (const city of cities) {
    entities.push({ type: 'PLACE', value: city, category: 'city' });
    actionChips.push(`Add shared place: ${city}`);
  }

  if (hasFriendship(trimmed, person)) {
    relationships.push({
      subject: person ?? 'unknown person',
      relationship: 'friend',
      object: 'self',
    });
    actionChips.push('Set relationship: friend');
    if (person) {
      memoryCandidates.push(`${person} is user's friend.`);
    }
  }

  if (hasGrewUpTogether(trimmed)) {
    const place = cities[0] ?? null;
    events.push({
      type: 'shared_upbringing',
      people: person ? ['self', person] : ['self'],
      place,
    });
    actionChips.push('Add shared history: grew up together');
    if (person && place) {
      memoryCandidates.push(`User and ${person} grew up together in ${place}.`);
    } else if (person) {
      memoryCandidates.push(`User and ${person} grew up together.`);
      ambiguities.push('grew up together could mean childhood friend, same neighborhood, or same community');
    }
  }

  if (hasSameSchoolReference(trimmed)) {
    entities.push({
      type: 'SCHOOL',
      value: 'same school',
      needs_resolution: true,
    });
    events.push({
      type: 'shared_school_attendance',
      people: person ? ['self', person] : ['self'],
      place: null,
      school_name: null,
      needs_clarification: true,
    });
    ambiguities.push('same school is unresolved; school name not provided');
    actionChips.push('Review school details');
    if (person) {
      memoryCandidates.push(`${person} went to the same school as user.`);
    }
  }

  if (/\bhe\b/i.test(trimmed) && person) {
    references.push({ pronoun: 'he', refers_to: person });
  }
  if (/\b(?:^|\s)me\b/i.test(trimmed)) {
    references.push({ phrase: 'me', refers_to: 'self' });
  }

  return {
    entities: dedupeEntities(entities),
    relationships,
    events,
    references,
    ambiguities,
    memoryCandidates,
    actionChips: [...new Set(actionChips)],
  };
}

function collectCoveredKeys(
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[],
): Set<string> {
  const covered = new Set<string>();
  for (const entity of index) {
    covered.add(normalizeNameKey(entity.name));
    for (const alias of entity.aliases) covered.add(normalizeNameKey(alias));
    for (const key of entity.mentionKeys) covered.add(key);
  }
  for (const match of existingMatches) {
    covered.add(normalizeNameKey(match.name));
    covered.add(normalizeNameKey(match.matchedLabel));
  }
  return covered;
}

function pushMatch(
  out: CertifiedEntityMatch[],
  seen: Set<string>,
  covered: Set<string>,
  match: CertifiedEntityMatch,
): void {
  const key = `${match.type}:${normalizeNameKey(match.name)}`;
  const slotKey = match.composerChipKind ? `${match.composerChipKind}:${key}` : key;
  if (seen.has(slotKey)) return;
  if (match.composerChipKind !== 'needs_clarification' && covered.has(normalizeNameKey(match.name))) return;
  seen.add(slotKey);
  out.push(match);
}

/** Map lexical parse to composer entity chips (no generic school entity). */
export function composerLexicalToMatches(
  parsed: ComposerLexicalParse,
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[],
): CertifiedEntityMatch[] {
  const covered = collectCoveredKeys(index, existingMatches);
  const seen = new Set<string>();
  const matches: CertifiedEntityMatch[] = [];

  for (const entity of parsed.entities) {
    if (entity.type === 'SCHOOL' && entity.needs_resolution) {
      pushMatch(matches, seen, covered, {
        id: 'unresolved:school:same-school',
        name: 'Same school',
        type: 'event',
        aliases: [],
        mentionKeys: ['same school'],
        status: 'suggestion',
        matchedLabel: 'same school',
        matchKind: 'full',
        composerChipKind: 'needs_clarification',
        actionLabel: 'Review school details',
      });
      continue;
    }

    if (entity.type === 'PERSON') {
      const name = titleCase(entity.value);
      if (!isIndividualPersonName(name)) continue;
      pushMatch(matches, seen, covered, {
        id: `draft:character:${normalizeNameKey(name)}`,
        name,
        type: 'character',
        aliases: [],
        mentionKeys: [normalizeNameKey(name)],
        status: 'draft',
        matchedLabel: name,
        matchKind: 'full',
        composerChipKind: 'entity',
      });
      continue;
    }

    if (entity.type === 'PLACE') {
      const name = titleCase(entity.value);
      pushMatch(matches, seen, covered, {
        id: `draft:location:${normalizeNameKey(name)}`,
        name,
        type: 'location',
        aliases: [],
        mentionKeys: [normalizeNameKey(name)],
        status: 'draft',
        matchedLabel: name,
        matchKind: 'full',
        composerChipKind: 'entity',
      });
    }
  }

  for (const rel of parsed.relationships) {
    if (rel.relationship !== 'friend') continue;
    pushMatch(matches, seen, covered, {
      id: 'lexical:relationship:friend',
      name: 'Friend',
      type: 'event',
      aliases: [],
      mentionKeys: ['friend'],
      status: 'draft',
      matchedLabel: 'friend',
      matchKind: 'full',
      composerChipKind: 'relationship',
      actionLabel: 'Set relationship: friend',
    });
  }

  for (const event of parsed.events) {
    if (event.type === 'shared_upbringing') {
      pushMatch(matches, seen, covered, {
        id: 'lexical:event:shared-upbringing',
        name: 'Grew up together',
        type: 'event',
        aliases: [],
        mentionKeys: ['grew up together'],
        status: 'draft',
        matchedLabel: 'grew up together',
        matchKind: 'full',
        composerChipKind: 'shared_history',
        actionLabel: 'Add shared history: grew up together',
      });
    }
  }

  return matches;
}

/** Returns true when a glossary alias is a generic venue noun, not a named place. */
export function isGenericVenueAlias(alias: string, category: string): boolean {
  if (category !== 'VENUE' && category !== 'GEOGRAPHY') return false;
  const key = norm(alias);
  if (GENERIC_VENUE_WORDS.has(key)) return true;
  if (key.startsWith('same ')) return true;
  return false;
}
