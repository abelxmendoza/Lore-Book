/**
 * Extract canonical place names from casual chat text.
 * Prefer "Abuela's House" and "Costco" over event-based nicknames.
 */

import { inferPlaceType } from '../constants/placeTypes';
import { normalizeNameKey } from './nameNormalization';

export type ExtractedNamedPlace = {
  name: string;
  type?: string;
  context: string;
  anchor: string;
  isNamed: boolean;
  mentionCount: number;
};

const BRAND_NAMES = new Set([
  'costco',
  'walmart',
  'target',
  'cvs',
  'walgreens',
  'whole foods',
  'trader joes',
  'trader joe',
  'starbucks',
  'mcdonalds',
  'home depot',
  'lowes',
  'safeway',
  'kroger',
  'aldi',
]);

const GENERIC_ONLY = new Set([
  'bar',
  'gym',
  'pharmacy',
  'store',
  'shop',
  'restaurant',
  'cafe',
  'house',
  'home',
  'couch',
  'room',
  'kitchen',
  'office',
  'park',
  'mall',
]);

const PLACE_TYPE_PATTERN =
  /\b(house|home|apartment|condo|casa|place|gym|bar|pharmacy|store|shop|restaurant|cafe|costco|mall|park|office|library|hospital|church|school|studio|garage|kitchen|couch|room)\b/i;

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCasePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

/** "abuelas" / "Abuela" → "Abuela" for display */
function normalizeOwnerToken(raw: string): string {
  const trimmed = raw.trim().replace(/['']s$/i, '').replace(/s$/i, '');
  return titleCaseWord(trimmed);
}

export function formatPossessivePlace(owner: string, placeType: string): string {
  const ownerLabel = normalizeOwnerToken(owner);
  const typeKey = placeType.toLowerCase();
  const typeLabel =
    typeKey === 'home' || typeKey === 'casa' ? 'House' : titleCaseWord(typeKey);
  return `${ownerLabel}'s ${typeLabel}`;
}

export function scorePlaceDisplayName(name: string): number {
  let score = 100;
  const words = name.split(/\s+/).filter(Boolean);
  score -= words.length * 7;
  if (/^the\s/i.test(name)) score -= 30;
  if (/\b(where|when|that|with|bought|testing|highlight|filled|shop with)\b/i.test(name)) score -= 25;
  if (/'s\s/i.test(name)) score += 18;
  const key = normalizeNameKey(name);
  if (BRAND_NAMES.has(key)) score += 25;
  for (const brand of BRAND_NAMES) {
    if (key.includes(brand)) score += 20;
  }
  if (words.length <= 3) score += 10;
  return score;
}

export function placeClusterKey(name: string, type?: string): string {
  const norm = normalizeNameKey(name)
    .replace(/-/g, ' ')
    .replace(/\b(two|basket|lorebook|couch|testing|highlight|filled|shop|with|the|at|where|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const brand of BRAND_NAMES) {
    if (norm === brand || norm.includes(brand)) return `brand:${brand}`;
  }

  const possessive = norm.match(/([a-z]+)s?\s+(house|home|apartment|casa|place)/);
  if (possessive) return `possessive:${possessive[1]}:${possessive[2]}`;

  const embedded = norm.match(/(?:at|in|near|by)\s+([a-z]+)s?\s+(house|home|apartment|casa|place)/);
  if (embedded) return `possessive:${embedded[1]}:${embedded[2]}`;

  if (type && GENERIC_ONLY.has(type.toLowerCase())) {
    const anchor = norm.match(/([a-z]{3,})/)?.[1];
    if (anchor && !GENERIC_ONLY.has(anchor)) return `generic:${anchor}:${type.toLowerCase()}`;
  }

  return `name:${norm.slice(0, 80)}`;
}

export function pickBestPlaceName(candidates: string[]): string {
  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length === 0) return '';
  return unique.sort((a, b) => scorePlaceDisplayName(b) - scorePlaceDisplayName(a))[0];
}

export function consolidateNamedPlaces(places: ExtractedNamedPlace[]): ExtractedNamedPlace[] {
  const groups = new Map<string, ExtractedNamedPlace[]>();

  for (const place of places) {
    const key = placeClusterKey(place.name, place.type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(place);
  }

  const merged: ExtractedNamedPlace[] = [];
  for (const group of groups.values()) {
    const bestName = pickBestPlaceName(group.map(g => g.name));
    const primary = group.find(g => g.name === bestName) ?? group[0];
    merged.push({
      ...primary,
      name: bestName,
      mentionCount: group.reduce((sum, g) => sum + g.mentionCount, 0),
      context: group.map(g => g.context).filter(Boolean).slice(0, 2).join(' · '),
    });
  }

  return merged.sort((a, b) => b.mentionCount - a.mentionCount || scorePlaceDisplayName(b.name) - scorePlaceDisplayName(a.name));
}

function addMatch(
  results: ExtractedNamedPlace[],
  seen: Set<string>,
  raw: { name: string; type?: string; context: string; anchor: string; isNamed: boolean }
) {
  const name = raw.name.trim();
  if (!name || name.length < 2) return;
  const key = normalizeNameKey(name);
  if (seen.has(key)) {
    const existing = results.find(r => normalizeNameKey(r.name) === key);
    if (existing) existing.mentionCount += 1;
    return;
  }
  seen.add(key);
  results.push({
    name,
    type: raw.type ?? inferPlaceType(name, raw.context) ?? undefined,
    context: raw.context.trim(),
    anchor: raw.anchor,
    isNamed: raw.isNamed,
    mentionCount: 1,
  });
}

/**
 * Pull named / anchor places from free-form user text (one message or many joined).
 */
export function extractNamedPlacesFromText(text: string): ExtractedNamedPlace[] {
  const results: ExtractedNamedPlace[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Possessive places: "Abuelas house", "Abuela's house", "tío Juan's apartment"
    const possessiveRe =
      /\b([a-zA-ZÀ-ÿ]+(?:'s|s)?)\s+(house|home|apartment|condo|casa|place)\b/gi;
    for (const match of line.matchAll(possessiveRe)) {
      const owner = match[1];
      const placeType = match[2];
      const name = formatPossessivePlace(owner, placeType);
      const anchor = placeClusterKey(name, placeType);
      addMatch(results, seen, {
        name,
        type: placeType.toLowerCase() === 'casa' ? 'home' : placeType.toLowerCase(),
        context: line,
        anchor,
        isNamed: true,
      });
    }

    // Retail / brand names
    const brandRe =
      /\b(costco|walmart|target|cvs|walgreens|whole foods|trader joe'?s?|starbucks|mcdonald'?s?|home depot|lowe'?s?|safeway|kroger|aldi)\b/gi;
    for (const match of line.matchAll(brandRe)) {
      const brand = match[1];
      const name = titleCasePhrase(brand.replace(/'/g, ''));
      addMatch(results, seen, {
        name,
        type: inferPlaceType(name, line) ?? 'store',
        context: line,
        anchor: `brand:${normalizeNameKey(brand)}`,
        isNamed: true,
      });
    }

    // Capitalized proper place after preposition: "at Golden Gate Park"
    const properRe =
      /\b(?:at|in|to|from|near|by)\s+(?:the\s+)?([A-Z][a-zA-Z]+(?:['\s][A-Za-zÀ-ÿ]+){0,4})\b/g;
    for (const match of line.matchAll(properRe)) {
      const candidate = match[1].trim();
      const lower = candidate.toLowerCase();
      if (GENERIC_ONLY.has(lower) || candidate.split(/\s+/).length === 1 && lower.length < 4) continue;
      if (!PLACE_TYPE_PATTERN.test(candidate) && candidate.split(/\s+/).length < 2) continue;
      addMatch(results, seen, {
        name: candidate,
        type: inferPlaceType(candidate, line) ?? undefined,
        context: line,
        anchor: placeClusterKey(candidate),
        isNamed: true,
      });
    }
  }

  return consolidateNamedPlaces(results);
}

/** Drop verbose auto-nicknames and generic-only duplicates when a named anchor exists. */
export function filterRedundantPlaceSuggestions<T extends { name: string; type?: string }>(items: T[]): T[] {
  const namedAnchors = new Set(
    items
      .filter(item => scorePlaceDisplayName(item.name) >= 85 || /'s\s/i.test(item.name))
      .map(item => placeClusterKey(item.name, item.type))
  );

  return items.filter(item => {
    const words = item.name.split(/\s+/);
    if (words.length > 7) return false;
    if (/^the\s.+\s(where|with|before|by)\s/i.test(item.name)) return false;

    const key = placeClusterKey(item.name, item.type);
    const isGenericLong =
      /^the\s/i.test(item.name) &&
      item.type &&
      GENERIC_ONLY.has(item.type.toLowerCase()) &&
      words.length >= 4;

    if (isGenericLong) {
      for (const anchor of namedAnchors) {
        if (anchor.startsWith('possessive:') || anchor.startsWith('brand:')) {
          if (key !== anchor && item.name.toLowerCase().includes(anchor.split(':')[1] ?? '')) {
            return false;
          }
        }
      }
      return namedAnchors.size === 0;
    }

    return true;
  });
}
