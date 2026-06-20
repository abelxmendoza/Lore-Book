/**
 * Detect when a suggestion may belong in a different LoreBook category.
 */

import { normalizeNameKey } from '../utils/nameNormalization';
import { runLexicalIntelligence } from './lexical/intelligence/lexicalIntelligenceService';
import {
  buildCrossBookIndexForUser,
  guardCrossBookEntity,
} from './lexical/projects/projectCrossBookGuard';
import type { CrossBookIndex } from './lexical/projects/projectSuggestionTypes';

export type SuggestionBookDomain =
  | 'characters'
  | 'locations'
  | 'skills'
  | 'projects'
  | 'quests'
  | 'organizations'
  | 'groups';

export type AlternativeCategory = {
  domain: SuggestionBookDomain;
  label: string;
  reason: 'known_in_book' | 'lexical_type' | 'cross_book_guard';
  confidence: number;
  matchedName?: string;
};

const DOMAIN_LABELS: Record<SuggestionBookDomain, string> = {
  characters: 'Characters',
  locations: 'Places',
  skills: 'Skills',
  projects: 'Projects',
  quests: 'Quests',
  organizations: 'Organizations',
  groups: 'Groups',
};

const LEXICAL_TYPE_TO_DOMAIN: Record<string, SuggestionBookDomain> = {
  PERSON: 'characters',
  CHARACTER: 'characters',
  IDENTITY_CLAIM: 'characters',
  PLACE: 'locations',
  VENUE: 'locations',
  TRAVEL_DESTINATION: 'locations',
  DEPLOYMENT_SITE: 'locations',
  WORKSITE: 'locations',
  SCHOOL: 'locations',
  ORGANIZATION: 'organizations',
  GROUP: 'groups',
  FRIEND_GROUP: 'groups',
  SCHOOL_CLUB: 'groups',
  SCHOOL_TEAM: 'groups',
  SKILL: 'skills',
  ACTIVITY: 'skills',
  WORK_ACTIVITY: 'skills',
  TASK: 'quests',
  EVENT: 'quests',
  OBJECT: 'projects',
};

function inCrossBookSet(name: string, set: Set<string>): boolean {
  const key = normalizeNameKey(name);
  if (!key) return false;
  if (set.has(key)) return true;
  for (const entry of set) {
    if (normalizeNameKey(entry) === key) return true;
  }
  return false;
}

function findCrossBookMatch(name: string, index: CrossBookIndex): AlternativeCategory[] {
  const alts: AlternativeCategory[] = [];
  const checks: Array<{ domain: SuggestionBookDomain; set: Set<string> }> = [
    { domain: 'characters', set: index.characters },
    { domain: 'locations', set: index.places },
    { domain: 'organizations', set: index.organizations },
    { domain: 'groups', set: index.groups },
    { domain: 'skills', set: index.skills },
  ];

  for (const { domain, set } of checks) {
    if (!inCrossBookSet(name, set)) continue;
    const matched = [...set].find((e) => normalizeNameKey(e) === normalizeNameKey(name)) ?? name;
    alts.push({
      domain,
      label: DOMAIN_LABELS[domain],
      reason: 'known_in_book',
      confidence: 0.88,
      matchedName: matched,
    });
  }
  return alts;
}

function lexicalAlternatives(text: string, currentDomain: SuggestionBookDomain): AlternativeCategory[] {
  const result = runLexicalIntelligence({
    text,
    analyzerMode: 'lite',
    includeAnalyzerEntities: true,
  });
  const alts: AlternativeCategory[] = [];
  const seen = new Set<SuggestionBookDomain>();

  for (const span of result.spans) {
    const domain = LEXICAL_TYPE_TO_DOMAIN[span.type];
    if (!domain || domain === currentDomain || seen.has(domain)) continue;
    if (!text.toLowerCase().includes(span.text.toLowerCase())) continue;
    seen.add(domain);
    alts.push({
      domain,
      label: DOMAIN_LABELS[domain],
      reason: 'lexical_type',
      confidence: Math.min(0.92, span.confidence + 0.05),
      matchedName: span.text,
    });
  }
  return alts;
}

function guardAlternatives(
  name: string,
  context: string,
  index: CrossBookIndex,
  currentDomain: SuggestionBookDomain
): AlternativeCategory[] {
  const guard = guardCrossBookEntity(name, context, index);
  if (guard.allowed || !guard.rejectedAs) return [];
  const domain = LEXICAL_TYPE_TO_DOMAIN[guard.rejectedAs];
  if (!domain || domain === currentDomain) return [];
  return [
    {
      domain,
      label: DOMAIN_LABELS[domain],
      reason: 'cross_book_guard',
      confidence: 0.9,
      matchedName: name,
    },
  ];
}

export function detectAlternativeCategories(
  name: string,
  currentDomain: SuggestionBookDomain,
  options?: { evidence?: string; index?: CrossBookIndex }
): AlternativeCategory[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const index = options?.index;
  const evidence = options?.evidence?.trim() ?? '';
  const scanText = evidence.length > 12 ? `${trimmed}. ${evidence}` : trimmed;

  const merged = new Map<SuggestionBookDomain, AlternativeCategory>();

  const add = (alt: AlternativeCategory) => {
    if (alt.domain === currentDomain) return;
    const prev = merged.get(alt.domain);
    if (!prev || alt.confidence > prev.confidence) merged.set(alt.domain, alt);
  };

  if (index) {
    for (const alt of findCrossBookMatch(trimmed, index)) add(alt);
    for (const alt of guardAlternatives(trimmed, scanText, index, currentDomain)) add(alt);
  }

  for (const alt of lexicalAlternatives(scanText, currentDomain)) add(alt);

  return [...merged.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

export async function enrichSuggestionsWithAlternatives<T extends Record<string, unknown>>(
  userId: string,
  currentDomain: SuggestionBookDomain,
  items: T[],
  getName: (item: T) => string,
  getEvidence?: (item: T) => string | undefined
): Promise<Array<T & { alternative_categories: AlternativeCategory[] }>> {
  const index = await buildCrossBookIndexForUser(userId).catch(() => undefined);
  return items.map((item) => ({
    ...item,
    alternative_categories: detectAlternativeCategories(getName(item), currentDomain, {
      evidence: getEvidence?.(item),
      index,
    }),
  }));
}

export { DOMAIN_LABELS as SUGGESTION_DOMAIN_LABELS };
