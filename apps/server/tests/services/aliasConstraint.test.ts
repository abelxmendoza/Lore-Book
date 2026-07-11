import { describe, expect, it } from 'vitest';

import {
  areConflictingKinshipAliases,
  filterValidAliases,
  isValidAliasForCharacter,
  shouldMergeCharacterRecords,
} from '../../src/services/characters/aliasConstraintService';

describe('aliasConstraintService', () => {
  it('rejects different uncles as aliases of each other', () => {
    expect(areConflictingKinshipAliases('Tío Rafa', 'Tío Ray')).toBe(true);
    expect(isValidAliasForCharacter('Tío Rafa', 'Tío Ray')).toBe(false);
    expect(isValidAliasForCharacter('Tio Rafa', 'Tio Ray')).toBe(false);
  });

  it('rejects grandmother title as alias for an uncle', () => {
    expect(areConflictingKinshipAliases('Tío Rafa', 'Abuela')).toBe(true);
    expect(isValidAliasForCharacter('Tío Rafa', 'Abuela')).toBe(false);
  });

  it('allows spelling variants for the same uncle', () => {
    expect(isValidAliasForCharacter('Tío Rafa', 'Tio Rafa')).toBe(true);
    expect(isValidAliasForCharacter('Tío Rafa', 'Uncle Rafa')).toBe(true);
  });

  it('filters polluted alias lists', () => {
    expect(
      filterValidAliases('Tío Rafa', ['Tio Rafa', 'Tío Ray', 'Abuela', 'Uncle Rafa'])
    ).toEqual(expect.arrayContaining(['Tio Rafa', 'Uncle Rafa']));
    expect(
      filterValidAliases('Tío Rafa', ['Tio Rafa', 'Tío Ray', 'Abuela', 'Uncle Rafa'])
    ).not.toEqual(expect.arrayContaining(['Tío Ray', 'Abuela']));
  });

  it('blocks merging distinct family members in payload merge', () => {
    expect(shouldMergeCharacterRecords('Tío Rafa', 'Tío Ray')).toBe(false);
    expect(shouldMergeCharacterRecords('Tío Rafa', 'Abuela')).toBe(false);
    expect(shouldMergeCharacterRecords('Tío Rafa', 'Tio Rafa', [], ['Tio Rafa'])).toBe(true);
  });

  it('rejects alias that matches another character canonical name', () => {
    expect(
      isValidAliasForCharacter('Tío Rafa', 'Abuela', { otherCanonicalNames: ['Abuela', 'Tío Ray'] })
    ).toBe(false);
  });
});
