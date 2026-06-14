// =====================================================
// CLUSTER MATCH
// Pure helpers for deciding whether two detected member clusters refer to the
// "same" group — used by the rejection-memory feedback loop so a group the user
// dismissed is not re-surfaced when it's detected again.
// =====================================================

export function normalizeMemberKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count members shared between two clusters (by normalized name). */
export function sharedMemberCount(a: string[], b: string[]): number {
  const setB = new Set(b.map(normalizeMemberKey));
  let count = 0;
  for (const key of new Set(a.map(normalizeMemberKey))) {
    if (setB.has(key)) count += 1;
  }
  return count;
}

/**
 * Two clusters "match" when they share at least two members, or when their
 * names are the same. Mirrors the candidate-dedup heuristic, applied here to
 * rejected candidates so dismissals are sticky across re-detection.
 */
export function clustersMatch(
  aMembers: string[],
  bMembers: string[],
  aName?: string,
  bName?: string
): boolean {
  if (aName && bName && normalizeMemberKey(aName) === normalizeMemberKey(bName)) return true;
  return sharedMemberCount(aMembers, bMembers) >= 2;
}
