import { describe, expect, it } from 'vitest';

import {
  matchCharacterNames,
  parseRelationalPlaceholder,
  isRelationalPlaceholder,
  formatNicknameName,
  weakGivenNameKeys,
  areNicknameVariants,
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

  it('parses slang possessive labels and short anchors', () => {
    expect(parseRelationalPlaceholder("V's Homegirl")).toEqual({ relation: 'homegirl', anchor: 'V' });
    expect(parseRelationalPlaceholder("Taylor's homeboy")).toEqual({ relation: 'homeboy', anchor: 'Taylor' });
    expect(parseRelationalPlaceholder('homie of Marcus')).toEqual({ relation: 'homie', anchor: 'Marcus' });
  });

  it('parses professional care roles like social worker', () => {
    expect(parseRelationalPlaceholder("Marcus's Social Worker")).toEqual({
      relation: 'social worker',
      anchor: 'Marcus',
    });
    expect(parseRelationalPlaceholder("Juan's social worker")).toEqual({
      relation: 'social worker',
      anchor: 'Juan',
    });
    expect(parseRelationalPlaceholder('a social worker of Marcus')).toEqual({
      relation: 'social worker',
      anchor: 'Marcus',
    });
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

describe('nickname variants', () => {
  it('matches Kiley ↔ Killa even when Killa is missing from aliases', () => {
    expect(areNicknameVariants('kiley', 'killa')).toBe(true);
    expect(matchCharacterNames('Killa', 'Kiley Tafur').matches).toBe(true);
    expect(matchCharacterNames('Killa', 'Kiley Tafur').reason).toBe('nickname_variant');
  });

  it('does not collapse distinct short names', () => {
    expect(areNicknameVariants('mark', 'mary')).toBe(false);
    expect(areNicknameVariants('john', 'jane')).toBe(false);
    expect(areNicknameVariants('kelly', 'killa')).toBe(false);
    expect(areNicknameVariants('mia', 'mila')).toBe(false);
  });
});
