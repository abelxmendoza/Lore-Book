import type { Character } from '../components/characters/CharacterProfileCard';

const SELF_NAMES = new Set(['me', 'myself', 'self', 'you']);

/** True when this character record represents the logged-in user. */
export function isSelfCharacter(char: Character): boolean {
  const meta = char.metadata ?? {};
  if (meta.distinct_from_self === true || meta.confirmed_distinct === true) return false;
  if (meta.is_self === true || meta.is_user === true) return true;
  const name = char.name?.trim().toLowerCase() ?? '';
  return SELF_NAMES.has(name);
}

/** Synthetic placeholder ids — not backed by the API yet. */
export function isSyntheticSelfId(id: string): boolean {
  return id === 'self-synthetic' || id === 'pending-self';
}
