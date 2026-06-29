import { describe, expect, it } from 'vitest';

import {
  matchCharacterNames,
  parseRelationalPlaceholder,
  isRelationalPlaceholder,
  formatNicknameName,
  weakGivenNameKeys,
} from './characterNameMatching';

describe('relational placeholders', () => {
  it('parses "<relation> of <Name>"', () => {
    expect(parseRelationalPlaceholder('friend of Shyla')).toEqual({ relation: 'friend', anchor: 'Shyla' });
    expect(parseRelationalPlaceholder('a coworker of Juan')).toEqual({ relation: 'coworker', anchor: 'Juan' });
  });

  it('parses "<Name>\'s <relation>" including a qualifier', () => {
    expect(parseRelationalPlaceholder("Shyla's friend")).toEqual({ relation: 'friend', anchor: 'Shyla' });
    expect(parseRelationalPlaceholder("Shyla's best friend")).toEqual({ relation: 'friend', anchor: 'Shyla' });
  });

  it('does not treat a kinship-titled person as a placeholder', () => {
    expect(parseRelationalPlaceholder('Tío Juan')).toBeNull();
    expect(isRelationalPlaceholder('Shyla')).toBe(false);
  });

  it('never matches a placeholder against its anchor', () => {
    expect(matchCharacterNames('friend of Shyla', 'Shyla').matches).toBe(false);
    expect(matchCharacterNames('Shyla', "Shyla's friend").matches).toBe(false);
  });

  it('matches two identical placeholders but not different ones', () => {
    expect(matchCharacterNames('friend of Shyla', "Shyla's friend").matches).toBe(true);
    expect(matchCharacterNames('friend of Shyla', 'coworker of Shyla').matches).toBe(false);
    expect(matchCharacterNames('friend of Shyla', 'friend of Mara').matches).toBe(false);
  });
});

describe('stage-name profile helpers', () => {
  it('formats [NICKNAME] [FIRSTNAME]', () => {
    expect(formatNicknameName('Oscuridad', 'Juan')).toBe('Oscuridad Juan');
    expect(formatNicknameName('Strawhat', 'Luffy')).toBe('Strawhat Luffy');
  });

  it('collapses when nickname and given name are the same', () => {
    expect(formatNicknameName('Juan', 'Juan')).toBe('Juan');
    expect(formatNicknameName('Oscuridad', '')).toBe('Oscuridad');
  });

  it('exposes the real first name as a weak dedup key', () => {
    expect(weakGivenNameKeys({ nickname: 'Oscuridad', givenName: 'Juan' }).has('juan')).toBe(true);
    expect(weakGivenNameKeys(null).size).toBe(0);
  });
});
