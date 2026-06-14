import { describe, expect, it } from 'vitest';
import { resolveCharacterAvatarUrl } from './characterAvatar';

describe('characterAvatar', () => {
  it('uses stored avatar when available', () => {
    expect(
      resolveCharacterAvatarUrl({
        id: 'char-1',
        avatar_url: 'https://cdn.example/avatar.svg',
      })
    ).toBe('https://cdn.example/avatar.svg');
  });

  it('generates DiceBear fallback from character id', () => {
    const url = resolveCharacterAvatarUrl({ id: 'char-1', role: 'human' });
    expect(url).toContain('api.dicebear.com');
    expect(url).toContain('char-1');
  });
});
