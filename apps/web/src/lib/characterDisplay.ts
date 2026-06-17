import type { Character } from '../components/characters/CharacterProfileCard';

export function getCharacterRealName(character: Pick<Character, 'name' | 'first_name' | 'last_name' | 'metadata'>): string | null {
  const meta = character.metadata ?? {};
  if (typeof meta.real_name === 'string' && meta.real_name.trim()) return meta.real_name.trim();
  if (character.first_name && character.last_name) {
    return `${character.first_name} ${character.last_name}`.trim();
  }
  if (character.first_name && !/^me$/i.test(character.first_name)) return character.first_name;
  return null;
}

export function getCharacterWittyTagline(character: Pick<Character, 'metadata' | 'summary'>): string | null {
  const meta = character.metadata ?? {};
  const witty =
    (typeof meta.witty_tagline === 'string' && meta.witty_tagline) ||
    (typeof meta.character_blurb === 'string' && meta.character_blurb) ||
    null;
  return witty || null;
}

export function getCharacterContextHooks(character: Pick<Character, 'metadata'>): string[] {
  const meta = character.metadata ?? {};
  return Array.isArray(meta.context_hooks)
    ? (meta.context_hooks as string[]).filter((h) => typeof h === 'string' && h.trim())
    : [];
}

export function getMainCharacterDisplayName(
  character: Pick<Character, 'name' | 'first_name' | 'last_name' | 'metadata'>,
  user?: { user_metadata?: Record<string, unknown>; email?: string | null } | null
): string {
  return (
    getCharacterRealName(character) ||
    character.name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You'
  );
}
