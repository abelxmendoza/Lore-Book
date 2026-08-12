import { describe, expect, it } from 'vitest';
import { isPetCharacter } from './isPetCharacter';

describe('isPetCharacter', () => {
  it('treats an explicit species as a pet', () => {
    expect(isPetCharacter({ species: 'dog' })).toBe(true);
    expect(isPetCharacter({ metadata: { species: 'tortoise' } })).toBe(true);
  });

  it('recognises pet relationship types, including directional edges', () => {
    for (const type of ['pet', 'dog', 'cat', 'kitten', 'rabbit', 'pet_of']) {
      expect(isPetCharacter({ metadata: { relationship_type: type } }), type).toBe(true);
    }
  });

  it('recognises a pet tag', () => {
    expect(isPetCharacter({ tags: ['household', 'pet'] })).toBe(true);
  });

  it('leaves people alone', () => {
    expect(isPetCharacter({ metadata: { relationship_type: 'mother' }, tags: ['family'] })).toBe(false);
    expect(isPetCharacter({ metadata: { relationship_type: 'friend' } })).toBe(false);
    // "pet name" as an affectionate nickname tag shouldn't flip a person to animal.
    expect(isPetCharacter({ tags: ['pet name'] })).toBe(false);
    expect(isPetCharacter({ species: '' })).toBe(false);
    expect(isPetCharacter(null)).toBe(false);
    expect(isPetCharacter(undefined)).toBe(false);
  });
});
