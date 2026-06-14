/**
 * Name normalization — the single app-side source of truth for "are these
 * the same name?". Every character/entity dedup comparison must go through
 * normalizeNameKey, or accent/case variants slip past ("Aunt Maribel" vs
 * "Aunt Maribel" created duplicate cards).
 *
 * Kept in sync with the SQL generated column characters.canonical_name
 * (migration *_characters_canonical_name.sql) — if you change the mapping
 * here, change the translate() map there.
 */

/** Lowercase, strip diacritics (NFD), collapse whitespace. */
export function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-token containment between two normalized names: every token of the
 * shorter name appears, in order, among the longer name's tokens (possessive
 * "'s"/"s" tolerated). Catches the duplicate shapes seen in production:
 *   "juan"        ⊂ "tio juan"                    (kinship prefix)
 *   "rafeh qazi"  ⊂ "rafeh qazi, my coding mentor" (appositive tail)
 *   "kelly"       ⊂ "kelly's meeting colleague"    (possessive — ambiguous!)
 * Token equality only — "sol" does NOT match "solomon".
 */
export function nameContained(shortNorm: string, longNorm: string): boolean {
  const clean = (s: string) => s.replace(/[.,;:!?]/g, '');
  const sTokens = clean(shortNorm).split(' ').filter(Boolean);
  const lTokens = clean(longNorm).split(' ').filter(Boolean);
  if (sTokens.length === 0 || sTokens.length >= lTokens.length) return false;
  let li = 0;
  for (const st of sTokens) {
    let found = false;
    while (li < lTokens.length) {
      const lt = lTokens[li++];
      if (lt === st || lt === `${st}'s` || lt === `${st}s`) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Containment in either direction (returns false for equal names). */
export function namesOverlapByContainment(aNorm: string, bNorm: string): boolean {
  return nameContained(aNorm, bNorm) || nameContained(bNorm, aNorm);
}

/**
 * True when the longer name uses the shorter name possessively
 * ("kelly's meeting colleague" for "kelly") — grammatically that describes a
 * DIFFERENT person, so a match must ask, never auto-merge.
 */
export function containmentIsPossessive(shortNorm: string, longNorm: string): boolean {
  const sTokens = shortNorm.split(' ').filter(Boolean);
  const lastShort = sTokens[sTokens.length - 1];
  if (!lastShort) return false;
  return new RegExp(`\\b${lastShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?s\\b`).test(longNorm)
    && !longNorm.split(' ').includes(lastShort);
}

export function splitPersonName(fullName: string): { firstName: string; lastName?: string } {
  const cleaned = (fullName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:mr|mrs|ms|miss|mx|dr|prof|professor|dj|sir|dame|lord|lady|rev|fr|father)\.?\s+/i, '');
  const parts = cleaned.split(' ').filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
}
