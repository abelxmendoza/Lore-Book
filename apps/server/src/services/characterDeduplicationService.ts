import { namesSimilar } from '../utils/jaroWinkler';
import { normalizeNameKey } from '../utils/nameNormalization';

export interface CharacterRecord {
  id: string;
  name: string;
  alias?: string[] | null;
}

const DEDUP_THRESHOLD = 0.85;

/**
 * Normalize a name for comparison: lowercase, strip possessives and leading articles.
 * "my mom" → "mom", "Sarah's friend" → "sarah"
 */
function normalizeName(name: string): string {
  return normalizeNameKey(name) // accent/case/whitespace normalization
    .replace(/^(my|her|his|their|our|the)\s+/i, '')
    .replace(/'s\s.*$/, '') // strip possessive tails ("sarah's friend" → "sarah")
    .trim();
}

/**
 * Return the existing character that is a fuzzy match for `name`, or null.
 *
 * Checks (in order):
 *   1. Exact match (normalized)
 *   2. Substring containment (normalized)
 *   3. Alias exact match (normalized)
 *   4. Jaro-Winkler ≥ DEDUP_THRESHOLD on canonical name
 *   5. Jaro-Winkler ≥ DEDUP_THRESHOLD on any alias
 */
export function findSimilarCharacter(
  name: string,
  existingCharacters: CharacterRecord[]
): CharacterRecord | null {
  if (!name || existingCharacters.length === 0) return null;

  const normalized = normalizeName(name);

  for (const char of existingCharacters) {
    const charNorm = normalizeName(char.name);

    // 1. Exact match
    if (normalized === charNorm) return char;

    // 2. Substring containment — "Mom" matches "my mom", "Jerry Smith" matches "Jerry"
    if (normalized.includes(charNorm) || charNorm.includes(normalized)) return char;

    // 3. Alias exact match
    const aliases = char.alias || [];
    for (const alias of aliases) {
      const aliasNorm = normalizeName(alias);
      if (normalized === aliasNorm || normalized.includes(aliasNorm) || aliasNorm.includes(normalized)) {
        return char;
      }
    }

    // 4. Jaro-Winkler on canonical name
    if (namesSimilar(normalized, charNorm, DEDUP_THRESHOLD)) return char;

    // 5. Jaro-Winkler on aliases
    for (const alias of aliases) {
      if (namesSimilar(normalized, normalizeName(alias), DEDUP_THRESHOLD)) return char;
    }
  }

  return null;
}
