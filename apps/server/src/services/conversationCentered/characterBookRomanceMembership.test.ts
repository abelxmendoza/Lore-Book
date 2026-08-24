import { describe, expect, it } from 'vitest';

import {
  belongsOnDatingSurface,
  characterBookRomanceKind,
  datingRowDefaultsForRomanceKind,
} from './characterBookRomanceMembership';

describe('characterBookRomanceKind', () => {
  it('puts a romantic-archetype Character Book person on Dating & Romance', () => {
    expect(
      characterBookRomanceKind({
        name: 'Kiley Tafur',
        alias: ['Kiley'],
        archetype: 'romantic',
        status: 'active',
      }),
    ).toBe('current');
    expect(belongsOnDatingSurface({ name: 'Kiley Tafur', archetype: 'romantic' })).toBe(true);
  });

  it('classifies past_romantic / ex relationship types as exes', () => {
    expect(characterBookRomanceKind({ name: 'Sam', archetype: 'past_romantic' })).toBe('ex');
    expect(
      characterBookRomanceKind({
        name: 'Jordan',
        metadata: { relationship_type: 'ex_girlfriend' },
      }),
    ).toBe('ex');
  });

  it('does not send family members to Dating & Romance', () => {
    expect(characterBookRomanceKind({ name: 'Tío Juan', archetype: 'romantic' })).toBeNull();
    expect(
      characterBookRomanceKind({
        name: 'Juan',
        alias: ['Tío Juan'],
        archetype: 'romantic',
      }),
    ).toBeNull();
  });

  it('ignores archived cards', () => {
    expect(
      characterBookRomanceKind({ name: 'Alex', archetype: 'romantic', status: 'archived' }),
    ).toBeNull();
  });

  it('maps kinds onto dating-row defaults', () => {
    expect(datingRowDefaultsForRomanceKind('ex')).toEqual({
      relationship_type: 'ex_lover',
      status: 'ended',
      is_current: false,
    });
  });
});
