import { normalizeNameKey } from '../../../utils/nameNormalization';
import { parseCharacterName } from '../../../utils/characterNameMatching';

const POSSESSIVE_SUFFIX_RE = /[''']s$/i;

/** Strip trailing possessive marker: "Tío Ralph's" → "Tío Ralph". */
export function stripPossessiveSuffix(name: string): string {
  return name.replace(POSSESSIVE_SUFFIX_RE, '').trim();
}

export function isBrokenPossessiveName(name: string): boolean {
  return POSSESSIVE_SUFFIX_RE.test(name.trim());
}

export type BrokenPossessiveResult = {
  isBroken: boolean;
  baseName?: string;
  aliasToAdd?: string;
};

/**
 * Detect broken possessive spans that should merge into a base identity card.
 */
export function evaluateBrokenPossessive(
  name: string,
  roster: Array<{ id: string; name: string }>,
): BrokenPossessiveResult {
  if (!isBrokenPossessiveName(name)) {
    return { isBroken: false };
  }

  const baseName = stripPossessiveSuffix(name);
  if (!baseName) return { isBroken: true, baseName: name };

  const baseKey = normalizeNameKey(baseName);
  const parsed = parseCharacterName(baseName);

  for (const row of roster) {
    const rowKey = normalizeNameKey(row.name);
    if (rowKey === baseKey) {
      return { isBroken: true, baseName: row.name, aliasToAdd: name.trim() };
    }
    const rowParsed = parseCharacterName(row.name);
    if (
      parsed.kinshipRole &&
      rowParsed.kinshipRole === parsed.kinshipRole &&
      parsed.coreName &&
      rowParsed.coreName === parsed.coreName
    ) {
      return { isBroken: true, baseName: row.name, aliasToAdd: name.trim() };
    }
  }

  return { isBroken: true, baseName, aliasToAdd: name.trim() };
}
