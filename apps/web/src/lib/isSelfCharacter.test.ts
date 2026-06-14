import { describe, it, expect } from 'vitest';
import { isSelfCharacter } from './isSelfCharacter';
import type { Character } from '../components/characters/CharacterProfileCard';

describe('isSelfCharacter', () => {
  it('detects metadata flags', () => {
    const c = { id: '1', name: 'Alex', metadata: { is_self: true } } as Character;
    expect(isSelfCharacter(c)).toBe(true);
  });

  it('detects reserved names', () => {
    expect(isSelfCharacter({ id: '1', name: 'Me' } as Character)).toBe(true);
    expect(isSelfCharacter({ id: '1', name: 'Sarah' } as Character)).toBe(false);
  });
});
