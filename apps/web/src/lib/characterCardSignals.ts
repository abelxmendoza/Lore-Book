/**
 * Character grid cards render the "what is this relationship" signal from
 * several independent fields (role, archetype, kinship label, status, tags).
 * When those fields overlap — e.g. a tag literally says "family" next to a
 * "Family" archetype badge — the card repeats the same word 2-4 times.
 * These helpers filter tags against whatever labels the card already shows.
 */

/** Lowercase, collapse dashes/underscores/whitespace to single spaces, trim. */
export function normalizeSignalLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filters `tags` down to ones that add information beyond `alreadyShown` —
 * exact match only (after normalization), so it never second-guesses a tag
 * that merely sounds related. Preserves original order and casing.
 */
export function getUniqueDisplayTags(
  tags: string[] | undefined,
  alreadyShown: Array<string | null | undefined>,
  max?: number,
): string[] {
  if (!tags || tags.length === 0) return [];

  const shown = new Set(
    alreadyShown
      .filter((label): label is string => Boolean(label && label.trim()))
      .map(normalizeSignalLabel),
  );

  const unique = tags.filter((tag) => tag.trim() && !shown.has(normalizeSignalLabel(tag)));
  return typeof max === 'number' ? unique.slice(0, max) : unique;
}
