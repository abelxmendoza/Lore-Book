/**
 * Client-side scrubbers for People / Places / Actors chrome.
 * Mirrors server entityLabelPollution enough to hide already-persisted junk
 * without waiting for a re-ingest.
 */

import {
  inferMentionLifecycleStatus,
  resolveMentionLifecycleStatus,
} from './mentionLifecycle';

const PLACE_JUNK =
  /^(?:current event|this weekend|this week|last weekend|memorial day(?: weekend)?|today|yesterday|tonight|tomorrow|(?:this|last|next)\s+(?:weekend|week|month|year))$/i;
const DATE_ONLY =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;
const POSSESSIVE_PLACE =
  /^(?:my|his|her|their|our)\s+(?:house|home|place|room|apartment|pad)$/i;

function normalizeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function preferCanonicalSpelling(a: string, b: string): string {
  const aScore =
    (a.includes("'") || a.includes('’') ? 2 : 0) + (/[À-ÿ]/.test(a) ? 1 : 0) + a.length / 100;
  const bScore =
    (b.includes("'") || b.includes('’') ? 2 : 0) + (/[À-ÿ]/.test(b) ? 1 : 0) + b.length / 100;
  return aScore >= bScore ? a : b;
}

export function isPollutingPersonDisplayLabel(name: string): boolean {
  const status = inferMentionLifecycleStatus(name);
  return status === 'IGNORE' || status === 'GENERIC';
}

export function isPollutingPlaceDisplayLabel(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (PLACE_JUNK.test(trimmed) || DATE_ONLY.test(trimmed) || POSSESSIVE_PLACE.test(trimmed)) {
    return true;
  }
  const life = inferMentionLifecycleStatus(trimmed);
  return life === 'IGNORE' || life === 'GENERIC';
}

export function scrubPeopleLabels(names: string[]): string[] {
  const byKey = new Map<string, string>();
  const order: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || isPollutingPersonDisplayLabel(name)) continue;
    const key = normalizeKey(name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, preferCanonicalSpelling(prev, name));
      continue;
    }
    byKey.set(key, name);
    order.push(key);
  }
  return order.map((k) => byKey.get(k)!);
}

export function scrubPlacesLabels(names: string[]): string[] {
  const byKey = new Map<string, string>();
  const order: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || isPollutingPlaceDisplayLabel(name)) continue;
    const key = normalizeKey(name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, preferCanonicalSpelling(prev, name));
      continue;
    }
    byKey.set(key, name);
    order.push(key);
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * Match a People:/Places: section through the next known clause header.
 * Stop-at-first-period leaves leftovers like "Chino. Chino." when the LLM
 * baked extra person fragments after the first period.
 */
const SUMMARY_CLAUSE_BOUNDARY = String.raw`(?=\s*(?:People|Places|Themes|Projects|Episodes|Open loops):|$)`;

/** Rewrite People:/Places: clauses in summary prose from scrubbed chip lists. */
export function scrubSummaryDisplayLine(
  text: string | null | undefined,
  people: string[],
  places: string[],
): string | null {
  if (text == null) return null;
  let out = String(text);
  const peopleClause = people.length ? `People: ${people.slice(0, 4).join(', ')}.` : '';
  const placesClause = places.length ? `Places: ${places.slice(0, 3).join(', ')}.` : '';
  if (/People:/i.test(out)) {
    out = out.replace(new RegExp(String.raw`People:\s*.+?${SUMMARY_CLAUSE_BOUNDARY}`, 'i'), peopleClause);
  }
  if (/Places:/i.test(out)) {
    out = out.replace(new RegExp(String.raw`Places:\s*.+?${SUMMARY_CLAUSE_BOUNDARY}`, 'i'), placesClause);
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim() || null;
}

export function isCastDisplayWorthy(
  name: string,
  kind?: string | null,
): boolean {
  const k = String(kind ?? '').toLowerCase();
  // Places / skills / events / orgs belong elsewhere — never in Actors.
  if (k === 'location' || k === 'skill' || k === 'event' || k === 'organization') {
    return false;
  }
  // Server cast already prefers RESOLVED; we only scrub display pollution.
  return !isPollutingPersonDisplayLabel(name);
}

/** Collapse same-name / appositive twin chips when a stale roster snapshot leaks. */
export function dedupeCastDisplayEntries<T extends { name: string; mentions?: number }>(
  entries: T[],
): T[] {
  if (entries.length <= 1) return entries;
  const byKey = new Map<string, T>();
  for (const entry of entries) {
    const key = normalizeKey(entry.name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, entry);
      continue;
    }
    const prevMentions = prev.mentions ?? 1;
    const nextMentions = entry.mentions ?? 1;
    const preferNext =
      nextMentions > prevMentions ||
      (nextMentions === prevMentions &&
        preferCanonicalSpelling(prev.name, entry.name) === entry.name);
    byKey.set(key, preferNext ? entry : prev);
  }
  // Containment merge for "Hell Fairy" vs longer descriptor tails.
  // Prefer the longer form when it looks like an intentional "Name the Epithet"
  // so Actors can show story titles; still prefer short for "from the …" scene tails.
  const list = [...byKey.values()];
  const keep = new Array(list.length).fill(true);
  for (let i = 0; i < list.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < list.length; j++) {
      if (!keep[j]) continue;
      const aKey = normalizeKey(list[i].name);
      const bKey = normalizeKey(list[j].name);
      const aTokens = aKey.split(' ').filter(Boolean);
      const bTokens = bKey.split(' ').filter(Boolean);
      const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
      const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;
      if (shorter.length === 0 || shorter.length >= longer.length) continue;
      let li = 0;
      let contained = true;
      for (const st of shorter) {
        let found = false;
        while (li < longer.length) {
          if (longer[li++] === st) {
            found = true;
            break;
          }
        }
        if (!found) {
          contained = false;
          break;
        }
      }
      if (!contained) continue;
      const shortIdx = aTokens.length <= bTokens.length ? i : j;
      const longIdx = shortIdx === i ? j : i;
      const longName = list[longIdx].name;
      const preferLong = /\bthe\b/i.test(longName) && !/\bfrom the\b/i.test(longName);
      const drop = preferLong ? shortIdx : longIdx;
      keep[drop] = false;
    }
  }
  return list.filter((_, idx) => keep[idx]);
}

export function resolveDisplayMentionStatus(
  name: string,
  lifecycleStatus?: string | null,
) {
  return resolveMentionLifecycleStatus(
    name,
    lifecycleStatus as 'RESOLVED' | 'UNRESOLVED' | 'GENERIC' | 'GROUP' | 'IGNORE' | null | undefined,
  );
}
