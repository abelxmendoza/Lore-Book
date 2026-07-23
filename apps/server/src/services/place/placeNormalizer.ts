import { normalizeNameKey } from '../../utils/nameNormalization';

export function normalizePlaceTitle(title: string): string {
  return (title ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function placeTitlesMatch(a: string, b: string): boolean {
  return normalizeNameKey(a) === normalizeNameKey(b);
}

/** Find an existing book name that this candidate should merge into. */
export function findExistingPlaceMatch(
  canonicalTitle: string,
  aliases: string[],
  knownPlaceNames: string[] = [],
): string | undefined {
  const keys = new Set(
    [canonicalTitle, ...aliases].map((name) => normalizeNameKey(name)).filter(Boolean),
  );
  for (const known of knownPlaceNames) {
    if (keys.has(normalizeNameKey(known))) return known;
  }
  // Containment: "Catch One because I" already trimmed → "Catch One"
  for (const known of knownPlaceNames) {
    const knownKey = normalizeNameKey(known);
    if (!knownKey) continue;
    if (normalizeNameKey(canonicalTitle) === knownKey) return known;
  }
  return undefined;
}
