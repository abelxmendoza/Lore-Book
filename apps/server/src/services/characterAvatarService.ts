import { logger } from '../logger';
import { avatarStyleFor, characterAvatarUrl } from '../utils/avatar';
import { cacheAvatar } from '../utils/cacheAvatar';
import { supabaseAdmin } from './supabaseClient';

type AvatarCharacter = {
  id: string;
  avatar_url?: string | null;
  archetype?: string | null;
  role?: string | null;
};

/** DiceBear URL for a character — always deterministic from id. */
export function displayAvatarUrl(character: AvatarCharacter): string {
  if (character.avatar_url) return character.avatar_url;
  const style = avatarStyleFor(character.archetype || character.role);
  return characterAvatarUrl(character.id, style);
}

/** Generate (and optionally cache) an avatar URL for a new character. */
export async function assignCharacterAvatar(
  characterId: string,
  opts: { archetype?: string | null; role?: string | null; cache?: boolean } = {}
): Promise<string> {
  const style = avatarStyleFor(opts.archetype || opts.role);
  const dicebearUrl = characterAvatarUrl(characterId, style);
  if (opts.cache === false) return dicebearUrl;
  try {
    return await cacheAvatar(characterId, dicebearUrl);
  } catch (error) {
    logger.warn({ error, characterId }, 'Avatar cache failed, using DiceBear URL');
    return dicebearUrl;
  }
}

/** Persist avatar_url when missing. Returns the URL to use. */
export async function ensureCharacterHasAvatar(
  userId: string,
  character: AvatarCharacter
): Promise<string> {
  if (character.avatar_url) return character.avatar_url;
  const avatarUrl = await assignCharacterAvatar(character.id, {
    archetype: character.archetype,
    role: character.role,
  });
  const { error } = await supabaseAdmin
    .from('characters')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', character.id)
    .eq('user_id', userId);
  if (error) {
    logger.warn({ error, characterId: character.id }, 'Failed to persist character avatar');
  }
  return avatarUrl;
}

/** Backfill avatars for characters missing avatar_url (max batch size enforced). */
export async function backfillMissingAvatars(
  userId: string,
  characters: AvatarCharacter[],
  limit = 20
): Promise<number> {
  const missing = characters.filter((c) => !c.avatar_url).slice(0, limit);
  let updated = 0;
  for (const character of missing) {
    await ensureCharacterHasAvatar(userId, character);
    updated += 1;
  }
  return updated;
}
