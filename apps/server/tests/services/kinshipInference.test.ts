import { describe, expect, it } from 'vitest';
import { extractKinshipMentions, parseKinshipFromName } from '../../src/services/kinship/kinshipGlossary';
import { expandEntityCandidates, splitCompoundMention } from '../../src/services/kinship/multiEntitySplitter';

describe('kinshipGlossary', () => {
  it('extracts three family members from a compound visit sentence', () => {
    const text = "I visited Abuela with Tío Juan and Tío Ray";
    const mentions = extractKinshipMentions(text);
    const names = mentions.map((m) => m.sourcePhrase.toLowerCase());
    expect(names.some((n) => n.includes('abuela'))).toBe(true);
    expect(names.some((n) => n.includes('juan'))).toBe(true);
    expect(names.some((n) => n.includes('ray'))).toBe(true);
    expect(mentions.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts kinship from possessive house phrase', () => {
    const text = "I went to Abuela's house with Tío Juan and Tío Ray";
    const mentions = extractKinshipMentions(text);
    expect(mentions.length).toBeGreaterThanOrEqual(3);
  });

  it('maps kinship titles to roles', () => {
    expect(parseKinshipFromName('Tío Juan')?.role).toBe('UNCLE');
    expect(parseKinshipFromName('Abuela')?.role).toBe('GRANDMOTHER');
  });
});

describe('multiEntitySplitter', () => {
  it('splits compound and/or lists', () => {
    expect(splitCompoundMention('Tío Juan and Tío Ray')).toEqual(['Tío Juan', 'Tío Ray']);
  });

  it('expands to three entity candidates for kinship sentence', () => {
    const text = "I visited Abuela with Tío Juan and Tío Ray";
    const expanded = expandEntityCandidates(text, [{ name: 'Abuela', type: 'PERSON' }]);
    const names = expanded.map((e) => e.name.toLowerCase());
    expect(names.filter((n) => n.includes('juan')).length).toBeGreaterThanOrEqual(1);
    expect(names.filter((n) => n.includes('ray')).length).toBeGreaterThanOrEqual(1);
    expect(names.filter((n) => n.includes('abuela')).length).toBeGreaterThanOrEqual(1);
    expect(expanded.length).toBeGreaterThanOrEqual(3);
  });
});
