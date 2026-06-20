/**
 * Shared helpers: skip entity suggestions when a name already exists in a book.
 */

import {
  containmentIsPossessive,
  normalizeNameKey,
  namesOverlapByContainment,
} from './nameNormalization';

export type BookNameEntry = {
  norm: string;
  label: string;
};

export type BookNameEntryWithId = BookNameEntry & { id?: string };

export type BookMatchStatus = 'new' | 'similar' | 'existing';

export type BookMatchResult = {
  status: BookMatchStatus;
  matchedName?: string;
  matchedId?: string;
};

export function collectNameKeys(names: Iterable<string>): { exactKeys: Set<string>; entries: BookNameEntry[] } {
  const exactKeys = new Set<string>();
  const entries: BookNameEntry[] = [];
  const seenNorm = new Set<string>();

  for (const raw of names) {
    const label = (raw ?? '').trim();
    if (!label) continue;
    const norm = normalizeNameKey(label);
    if (!norm || seenNorm.has(norm)) continue;
    seenNorm.add(norm);
    exactKeys.add(norm);
    entries.push({ norm, label });
  }

  return { exactKeys, entries };
}

/** Build index from book rows — each row can contribute multiple alias labels. */
export function collectBookEntriesWithIds(
  rows: Array<{ id?: string; names: Iterable<string> }>
): { exactKeys: Set<string>; entries: BookNameEntryWithId[] } {
  const exactKeys = new Set<string>();
  const entries: BookNameEntryWithId[] = [];
  const seenNorm = new Set<string>();

  for (const row of rows) {
    for (const raw of row.names) {
      const label = (raw ?? '').trim();
      if (!label) continue;
      const norm = normalizeNameKey(label);
      if (!norm || seenNorm.has(norm)) continue;
      seenNorm.add(norm);
      exactKeys.add(norm);
      entries.push({ norm, label, id: row.id });
    }
  }

  return { exactKeys, entries };
}

/**
 * Classify a candidate against book entries:
 * - existing — exact match, hide from suggestions
 * - similar — partial/containment overlap, show merge hint
 * - new — not in book
 */
export function resolveBookNameMatch(
  candidate: string,
  exactKeys: Set<string>,
  entries: BookNameEntryWithId[]
): BookMatchResult {
  const norm = normalizeNameKey(candidate);
  if (!norm || norm.length < 2) return { status: 'existing' };

  for (const entry of entries) {
    if (entry.norm === norm) {
      return { status: 'existing', matchedName: entry.label, matchedId: entry.id };
    }
  }
  if (exactKeys.has(norm)) {
    const hit = entries.find((e) => e.norm === norm);
    return { status: 'existing', matchedName: hit?.label ?? candidate.trim(), matchedId: hit?.id };
  }

  for (const entry of entries) {
    if (!namesOverlapByContainment(norm, entry.norm)) continue;
    const shorter = norm.length <= entry.norm.length ? norm : entry.norm;
    const longer = norm.length > entry.norm.length ? norm : entry.norm;
    if (containmentIsPossessive(shorter, longer)) continue;
    return { status: 'similar', matchedName: entry.label, matchedId: entry.id };
  }

  return { status: 'new' };
}

/**
 * True when `candidate` matches any name already in the book (exact, alias, or
 * safe token containment — e.g. "Dana" matches "Dana Onboarding").
 */
export function isNameAlreadyInBook(
  candidate: string,
  exactKeys: Set<string>,
  entries: BookNameEntry[]
): boolean {
  return resolveBookNameMatch(candidate, exactKeys, entries).status !== 'new';
}
