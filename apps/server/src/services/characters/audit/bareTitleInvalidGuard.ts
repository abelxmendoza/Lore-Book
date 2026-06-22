import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import { parseCharacterName } from '../../../utils/characterNameMatching';
import { isContextualTitle } from './ambiguousCharacterGuard';

/** Honorifics and bare role words that cannot stand alone without context. */
export const BARE_TITLE_WORDS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'professor',
  'pastor',
  'coach',
  'tio',
  'tía',
  'tia',
  'cousin',
  'friend',
  'homie',
  'guy',
  'girl',
  'recruiter',
  'investor',
  'promoter',
]);

export function isBareTitleInvalid(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (isContextualTitle(trimmed)) return false;

  const key = normalizePersonNameKey(trimmed);
  if (BARE_TITLE_WORDS.has(key)) return true;

  const parsed = parseCharacterName(trimmed);
  // Title-only kinship with no core name: "Cousin", "Tio" alone
  if (parsed.kinshipRole && !parsed.coreName && key !== 'mom' && key !== 'dad') {
    if (key === 'cousin' || key === 'tio' || key === 'tia' || key === 'uncle' || key === 'aunt') {
      return true;
    }
  }

  return false;
}
