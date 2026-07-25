import { describe, expect, it } from 'vitest';
import { isLexicalNoiseToken } from './lexicalNoiseTokens';

describe('isLexicalNoiseToken', () => {
  it('rejects junk composer tokens', () => {
    expect(isLexicalNoiseToken('my')).toBe(true);
    expect(isLexicalNoiseToken('you')).toBe(true);
    expect(isLexicalNoiseToken('What')).toBe(true);
    expect(isLexicalNoiseToken('Tell')).toBe(true);
    expect(isLexicalNoiseToken('Also')).toBe(true);
    expect(isLexicalNoiseToken('also')).toBe(true);
    expect(isLexicalNoiseToken('However')).toBe(true);
  });

  it('keeps proper entities', () => {
    expect(isLexicalNoiseToken('Northwind')).toBe(false);
    expect(isLexicalNoiseToken('NWU')).toBe(false);
  });
});
