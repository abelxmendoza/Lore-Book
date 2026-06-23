import { normalizeNameKey } from '../../utils/nameNormalization';
import { titleCaseIdentity } from './canonicalTitleNormalizer';

export function canonicalIdentityKey(value: string): string {
  return normalizeNameKey(value)
    .replace(/[’‘]/g, "'")
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildAliasSet(primary: string, raw: string, extra: string[] = []): string[] {
  const aliases = new Map<string, string>();
  for (const alias of [raw, ...extra]) {
    const cleaned = alias.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    if (canonicalIdentityKey(cleaned) === canonicalIdentityKey(primary)) continue;
    aliases.set(canonicalIdentityKey(cleaned), titleCaseIdentity(cleaned));
  }
  return [...aliases.values()];
}

export function labelsMatch(left: string, right: string): boolean {
  return canonicalIdentityKey(left) === canonicalIdentityKey(right);
}
