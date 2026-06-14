import { normalizeNameKey } from '../../utils/nameNormalization';

/** Canonical dedup key for skill names — use everywhere skills are matched or indexed. */
export function normalizeSkillKey(name: string): string {
  return normalizeNameKey(name);
}

export function skillKeysMatch(a: string, b: string): boolean {
  return normalizeSkillKey(a) === normalizeSkillKey(b);
}
