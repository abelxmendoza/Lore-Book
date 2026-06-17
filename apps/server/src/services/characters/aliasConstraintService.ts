/**
 * Guards against cross-person alias pollution — e.g. "Tío Juan" must not
 * accumulate "Tío Ray" or "Abuela" from co-mentioned family sentences.
 */
import { matchCharacterNames, parseCharacterName } from '../../utils/characterNameMatching';
import { normalizeNameKey } from '../../utils/nameNormalization';

/** Same kinship bucket but different given names → different people. */
export function areConflictingKinshipAliases(a: string, b: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;

  const pa = parseCharacterName(a);
  const pb = parseCharacterName(b);

  if (pa.kinshipRole && pb.kinshipRole && pa.kinshipRole === pb.kinshipRole) {
    if (pa.coreName && pb.coreName && pa.coreName !== pb.coreName) return true;
  }

  if (pa.kinshipRole && pb.kinshipRole && pa.kinshipRole !== pb.kinshipRole) {
    if (!matchCharacterNames(a, b).matches) return true;
  }

  if (pa.kinshipRole && !pa.coreName && pb.kinshipRole && pb.coreName && pa.kinshipRole !== pb.kinshipRole) {
    return true;
  }
  if (pb.kinshipRole && !pb.coreName && pa.kinshipRole && pa.coreName && pa.kinshipRole !== pb.kinshipRole) {
    return true;
  }

  return false;
}

export function isValidAliasForCharacter(
  canonicalName: string,
  alias: string,
  options?: { otherCanonicalNames?: string[] }
): boolean {
  const cleaned = alias?.trim();
  if (!cleaned || !canonicalName?.trim()) return false;

  const canonicalKey = normalizeNameKey(canonicalName);
  const aliasKey = normalizeNameKey(cleaned);
  if (aliasKey === canonicalKey) {
    return cleaned !== canonicalName.trim();
  }
  if (areConflictingKinshipAliases(canonicalName, cleaned)) return false;

  for (const other of options?.otherCanonicalNames ?? []) {
    if (!other?.trim()) continue;
    if (normalizeNameKey(other) !== aliasKey) continue;
    if (normalizeNameKey(other) === canonicalKey) continue;
    if (areConflictingKinshipAliases(canonicalName, other)) return false;
    if (!matchCharacterNames(canonicalName, other).matches) return false;
  }

  return matchCharacterNames(canonicalName, cleaned).matches;
}

export function filterValidAliases(
  canonicalName: string,
  aliases: Array<string | null | undefined>,
  options?: { otherCanonicalNames?: string[] }
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of aliases) {
    if (!alias?.trim()) continue;
    const key = normalizeNameKey(alias);
    if (seen.has(key)) continue;
    if (!isValidAliasForCharacter(canonicalName, alias, options)) continue;
    seen.add(key);
    out.push(alias.trim());
  }
  return out;
}

export function shouldMergeCharacterRecords(
  leftName: string,
  rightName: string,
  leftAliases: string[] = [],
  rightAliases: string[] = []
): boolean {
  if (areConflictingKinshipAliases(leftName, rightName)) return false;
  for (const alias of [...leftAliases, ...rightAliases]) {
    if (areConflictingKinshipAliases(leftName, alias)) return false;
    if (areConflictingKinshipAliases(rightName, alias)) return false;
  }
  return true;
}
