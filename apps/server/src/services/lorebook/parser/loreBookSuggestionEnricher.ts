/**
 * Enrich suggestion API items with LoreBook Parse Engine alternatives and redirects.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { AlternativeCategory, SuggestionBookDomain } from '../../suggestionCrossBookService';
import { detectAlternativeCategories } from '../../suggestionCrossBookService';
import { buildCrossBookIndexForUser } from '../../lexical/projects/projectCrossBookGuard';
import { buildCanonIndexForUser } from './canonIndexBuilder';
import { parseLoreBookText } from './loreBookParseEngine';
import type { CanonIndex, LoreBookDomain, LoreBookOperation, LoreBookParseResult } from './loreBookParserTypes';

const BOOK_TO_PARSER: Record<SuggestionBookDomain, LoreBookDomain> = {
  characters: 'characters',
  locations: 'locations',
  skills: 'skills',
  projects: 'projects',
  quests: 'quests',
  organizations: 'organizations',
  groups: 'groups',
};

const PARSER_DOMAIN_LABELS: Record<string, string> = {
  characters: 'Characters',
  locations: 'Places',
  skills: 'Skills',
  projects: 'Projects',
  quests: 'Quests',
  organizations: 'Organizations',
  groups: 'Groups',
  schools: 'Schools',
  work: 'Work',
  family: 'Family',
  events: 'Events',
  relationships: 'Relationships',
  timeline: 'Timeline',
};

function nameKey(name: string): string {
  return normalizeNameKey(name);
}

function scanTextForItem(name: string, evidence: string): string {
  return evidence.length > 8 ? `${name}. ${evidence}` : name;
}

function getCachedParseResult(
  userId: string,
  scanText: string,
  canon: CanonIndex | undefined,
  cache: Map<string, LoreBookParseResult | null>
): LoreBookParseResult | null {
  const key = normalizeNameKey(scanText);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const result = parseLoreBookText({ userId, text: scanText.trim(), canon });
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function alternativesFromParseResult(
  name: string,
  currentDomain: SuggestionBookDomain,
  parseResult: LoreBookParseResult
): AlternativeCategory[] {
  const key = nameKey(name);
  if (!key) return [];

  const merged = new Map<SuggestionBookDomain, AlternativeCategory>();

  const add = (alt: AlternativeCategory) => {
    if (alt.domain === currentDomain) return;
    const prev = merged.get(alt.domain);
    if (!prev || alt.confidence > prev.confidence) merged.set(alt.domain, alt);
  };

  const allOps: LoreBookOperation[] = [
    ...parseResult.operations,
    ...parseResult.redirects,
  ];

  for (const op of allOps) {
    if (op.kind === 'redirect' && nameKey(op.name) === key) {
      const domain = op.toDomain as SuggestionBookDomain;
      if (PARSER_DOMAIN_LABELS[domain]) {
        add({
          domain,
          label: PARSER_DOMAIN_LABELS[domain] ?? domain,
          reason: 'cross_book_guard',
          confidence: op.confidence,
          matchedName: op.name,
        });
      }
      continue;
    }

    if (op.kind === 'suggest_add' && nameKey(op.name) === key) {
      const domain = op.domain as SuggestionBookDomain;
      if (domain !== currentDomain && PARSER_DOMAIN_LABELS[domain]) {
        add({
          domain,
          label: PARSER_DOMAIN_LABELS[domain] ?? domain,
          reason: 'lexical_type',
          confidence: op.confidence,
          matchedName: op.name,
        });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

export async function enrichSuggestionsWithParserAlternatives<T extends Record<string, unknown>>(
  userId: string,
  currentDomain: SuggestionBookDomain,
  items: T[],
  getName: (item: T) => string,
  getEvidence?: (item: T) => string | undefined
): Promise<Array<T & { alternative_categories: AlternativeCategory[]; parser_enriched?: boolean }>> {
  const [canon, crossBook] = await Promise.all([
    buildCanonIndexForUser(userId).catch(() => undefined),
    buildCrossBookIndexForUser(userId).catch(() => undefined),
  ]);

  const parseCache = new Map<string, LoreBookParseResult | null>();

  return items.map((item) => {
    const name = getName(item);
    const evidence = getEvidence?.(item)?.trim() ?? '';
    const scanText = scanTextForItem(name, evidence);

    const parseResult = getCachedParseResult(userId, scanText, canon, parseCache);
    const legacyAlts = detectAlternativeCategories(name, currentDomain, {
      evidence,
      index: crossBook,
    });

    const parserAlts = parseResult ? alternativesFromParseResult(name, currentDomain, parseResult) : [];
    const merged = new Map<SuggestionBookDomain, AlternativeCategory>();

    for (const alt of [...legacyAlts, ...parserAlts]) {
      const prev = merged.get(alt.domain);
      if (!prev || alt.confidence > prev.confidence) merged.set(alt.domain, alt);
    }

    return {
      ...item,
      alternative_categories: [...merged.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4),
      parser_enriched: parserAlts.length > 0,
    };
  });
}

export { BOOK_TO_PARSER };
