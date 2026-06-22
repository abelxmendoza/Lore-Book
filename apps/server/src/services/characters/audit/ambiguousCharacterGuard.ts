import { parseCharacterName, kinshipRoleKey } from '../../../utils/characterNameMatching';
import { normalizePersonNameKey } from '../../../utils/personNameValidation';

/** Bare labels that require story context before they can be character cards. */
export const AMBIGUOUS_ROLE_PATTERNS: RegExp[] = [
  /^potential\s+investor$/i,
  /^old\s+college\s+roommate$/i,
  /^new\s+guy$/i,
  /^the\s+new\s+guy$/i,
  /^recruiter$/i,
  /^investor$/i,
  /^promoter$/i,
  /^roommate$/i,
  /^neighbor$/i,
  /^coworker$/i,
  /^classmate$/i,
];

/** Generic family labels without a given name. */
export const GENERIC_FAMILY_LABELS = new Set([
  'cousin',
  'friend',
  'homie',
  'guy',
  'girl',
  'bro',
  'sis',
  'sibling',
]);

export function isAmbiguousRoleLabel(name: string): boolean {
  const key = normalizePersonNameKey(name);
  if (!key) return false;
  return AMBIGUOUS_ROLE_PATTERNS.some((re) => re.test(key));
}

export function isGenericFamilyLabel(name: string): boolean {
  const key = normalizePersonNameKey(name);
  if (GENERIC_FAMILY_LABELS.has(key)) return true;
  // "cousin" with no given name
  if (key === 'cousin') return true;
  const parsed = parseCharacterName(name);
  return parsed.kinshipRole === 'cousin' && !parsed.coreName;
}

/** Family-title + given name is valid: Tía Grace, Tio Ralph, Step Dad Ben, Mom. */
export function isValidFamilyTitleName(name: string): boolean {
  const parsed = parseCharacterName(name);
  if (parsed.kinshipRole && parsed.coreName) return true;
  if (kinshipRoleKey(name)) return true;
  if (/^step\s*(?:dad|father|mom|mother)\s+\S+/i.test(name.trim())) return true;
  return false;
}

/** Stage/nickname personas — short distinctive labels. */
export function looksLikeStageOrNickname(name: string): boolean {
  const key = normalizePersonNameKey(name);
  const stageHints = ['goth', 'fairy', 'baby bats', 'oscuridad', 'hell fairy'];
  if (stageHints.some((h) => key.includes(h))) return true;
  if (/^(?:dj|goth)\s+/i.test(name)) return true;
  return false;
}

export function isContextualTitle(name: string): boolean {
  return /\bfrom\b|\bwith\b|\bat\b/i.test(name);
}

export { isBareTitleInvalid } from './bareTitleInvalidGuard';
