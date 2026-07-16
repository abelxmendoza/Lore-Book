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
    expect(isSelfCharacter({ id: '1', name: 'And You' } as Character)).toBe(true);
    expect(isSelfCharacter({ id: '1', name: 'Also You' } as Character)).toBe(true);
    expect(isSelfCharacter({ id: '1', name: 'Sarah' } as Character)).toBe(false);
  });

  it('ignores characters explicitly marked distinct from self', () => {
    const c = {
      id: '1',
      name: 'Hell Fairy',
      metadata: { is_self: true, distinct_from_self: true },
    } as Character;
    expect(isSelfCharacter(c)).toBe(false);
  });
});
