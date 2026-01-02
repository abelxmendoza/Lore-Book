import crypto from 'crypto';

/**
 * Generate a deterministic seed from a character UUID using SHA-256
 */
export function avatarSeed(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex');
}

/**
 * Generate a DiceBear avatar URL for a character
 * @param id - Character UUID
 * @param style - DiceBear style (default: 'bottts')
 * @returns DiceBear API URL
 */
export function characterAvatarUrl(id: string, style: string = 'bottts'): string {
  const seed = avatarSeed(id);
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}

/**
 * Map character type/archetype to appropriate DiceBear style
 */
const styleMap: Record<string, string> = {
  human: 'adventurer',
  ai: 'bottts',
  location: 'shapes',
  event: 'identicon',
};

/**
 * Get appropriate DiceBear style for a character type
 * @param type - Character type, archetype, or role
 * @returns DiceBear style name
 */
export function avatarStyleFor(type: string | undefined | null): string {
  if (!type) return 'bottts';
  const normalized = type.toLowerCase();
  return styleMap[normalized] || 'bottts';
}
