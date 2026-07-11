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
    expect(parseRelationalPlaceholder('friend of Shana')).toEqual({ relation: 'friend', anchor: 'Shana' });
    expect(parseRelationalPlaceholder('a coworker of Juan')).toEqual({ relation: 'coworker', anchor: 'Juan' });
  });

  it('parses "<Name>\'s <relation>" including a qualifier', () => {
    expect(parseRelationalPlaceholder("Shana's friend")).toEqual({ relation: 'friend', anchor: 'Shana' });
    expect(parseRelationalPlaceholder("Shana's best friend")).toEqual({ relation: 'friend', anchor: 'Shana' });
  });

  it('does not treat a kinship-titled person as a placeholder', () => {
    expect(parseRelationalPlaceholder('Tío Rafa')).toBeNull();
    expect(isRelationalPlaceholder('Shana')).toBe(false);
  });

  it('never matches a placeholder against its anchor', () => {
    expect(matchCharacterNames('friend of Shana', 'Shana').matches).toBe(false);
    expect(matchCharacterNames('Shana', "Shana's friend").matches).toBe(false);
  });

  it('matches two identical placeholders but not different ones', () => {
    expect(matchCharacterNames('friend of Shana', "Shana's friend").matches).toBe(true);
    expect(matchCharacterNames('friend of Shana', 'coworker of Shana').matches).toBe(false);
    expect(matchCharacterNames('friend of Shana', 'friend of Mara').matches).toBe(false);
  });
});

describe('stage-name profile helpers', () => {
  it('formats [NICKNAME] [FIRSTNAME]', () => {
    expect(formatNicknameName('Obscurio', 'Juan')).toBe('Obscurio Juan');
    expect(formatNicknameName('Strawhat', 'Luffy')).toBe('Strawhat Luffy');
  });

  it('collapses when nickname and given name are the same', () => {
    expect(formatNicknameName('Juan', 'Juan')).toBe('Juan');
    expect(formatNicknameName('Obscurio', '')).toBe('Obscurio');
  });

  it('exposes the real first name as a weak dedup key', () => {
    expect(weakGivenNameKeys({ nickname: 'Obscurio', givenName: 'Juan' }).has('juan')).toBe(true);
    expect(weakGivenNameKeys(null).size).toBe(0);
  });
});
