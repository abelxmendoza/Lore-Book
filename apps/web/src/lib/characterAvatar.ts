/**
 * Client-side avatar URL resolver — mirrors apps/server/src/utils/avatar.ts
 * so cards always show a deterministic DiceBear icon even before backfill.
 */

const styleMap: Record<string, string> = {
  human: 'adventurer',
  ai: 'bottts',
  location: 'shapes',
  event: 'identicon',
};

const seedCache = new Map<string, string>();

async function avatarSeed(id: string): Promise<string> {
  const cached = seedCache.get(id);
  if (cached) return cached;
  const data = new TextEncoder().encode(id);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const seed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  seedCache.set(id, seed);
  return seed;
}

function avatarStyleFor(type: string | undefined | null): string {
  if (!type) return 'bottts';
  return styleMap[type.toLowerCase()] || 'bottts';
}

export async function computeCharacterAvatarUrl(
  id: string,
  opts?: { archetype?: string | null; role?: string | null }
): Promise<string> {
  const style = avatarStyleFor(opts?.archetype || opts?.role);
  const seed = await avatarSeed(id);
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}

export type CharacterAvatarSource = {
  id: string;
  avatar_url?: string | null;
  archetype?: string | null;
  role?: string | null;
};

/** Sync resolver when avatar_url is already set; otherwise falls back to id-based DiceBear (stable enough for instant render). */
export function resolveCharacterAvatarUrl(character: CharacterAvatarSource): string {
  if (character.avatar_url) return character.avatar_url;
  const style = avatarStyleFor(character.archetype || character.role);
  // Sync fallback uses character id — server backfill replaces with sha256-seeded cached URL.
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(character.id)}`;
}

export async function resolveCharacterAvatarUrlExact(
  character: CharacterAvatarSource
): Promise<string> {
  if (character.avatar_url) return character.avatar_url;
  return computeCharacterAvatarUrl(character.id, {
    archetype: character.archetype,
    role: character.role,
  });
}
