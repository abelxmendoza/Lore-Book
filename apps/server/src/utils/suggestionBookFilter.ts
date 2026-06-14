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

/**
 * True when `candidate` matches any name already in the book (exact, alias, or
 * safe token containment — e.g. "Dana" matches "Dana Onboarding").
 */
export function isNameAlreadyInBook(
  candidate: string,
  exactKeys: Set<string>,
  entries: BookNameEntry[]
): boolean {
  const norm = normalizeNameKey(candidate);
  if (!norm || norm.length < 2) return true;
  if (exactKeys.has(norm)) return true;

  for (const entry of entries) {
    if (entry.norm === norm) return true;
    if (namesOverlapByContainment(norm, entry.norm)) {
      const shorter = norm.length <= entry.norm.length ? norm : entry.norm;
      const longer = norm.length > entry.norm.length ? norm : entry.norm;
      if (containmentIsPossessive(shorter, longer)) continue;
      return true;
    }
  }

  return false;
}
