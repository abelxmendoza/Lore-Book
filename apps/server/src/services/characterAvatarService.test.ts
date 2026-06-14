import { describe, expect, it, vi } from 'vitest';
import { displayAvatarUrl, assignCharacterAvatar } from './characterAvatarService';

vi.mock('../utils/cacheAvatar', () => ({
  cacheAvatar: vi.fn(async (_id: string, url: string) => url),
}));

describe('characterAvatarService', () => {
  it('returns stored avatar when present', () => {
    expect(
      displayAvatarUrl({
        id: 'abc',
        avatar_url: 'https://example.com/me.svg',
        archetype: 'human',
      })
    ).toBe('https://example.com/me.svg');
  });

  it('generates DiceBear URL when avatar is missing', () => {
    const url = displayAvatarUrl({ id: '550e8400-e29b-41d4-a716-446655440000', archetype: 'human' });
    expect(url).toContain('api.dicebear.com');
    expect(url).toContain('adventurer');
  });

  it('assignCharacterAvatar returns a dicebear url', async () => {
    const url = await assignCharacterAvatar('550e8400-e29b-41d4-a716-446655440000', { cache: false });
    expect(url).toContain('api.dicebear.com');
  });
});
