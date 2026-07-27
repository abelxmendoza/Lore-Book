import { describe, expect, it } from 'vitest';
import { sexFromFirstName } from './sexFromName';

describe('sexFromFirstName', () => {
  it('confidently guesses common English male names', () => {
    expect(sexFromFirstName('Michael')).toBe('male');
    expect(sexFromFirstName('James')).toBe('male');
    expect(sexFromFirstName('William Rivera')).toBe('male');
  });

  it('confidently guesses common English female names', () => {
    expect(sexFromFirstName('Sarah')).toBe('female');
    expect(sexFromFirstName('Jennifer')).toBe('female');
    expect(sexFromFirstName('Isabella Chen')).toBe('female');
  });

  it('confidently guesses common Spanish names of both sexes', () => {
    expect(sexFromFirstName('Juan')).toBe('male');
    expect(sexFromFirstName('Carlos')).toBe('male');
    expect(sexFromFirstName('Maria')).toBe('female');
    expect(sexFromFirstName('Gabriela')).toBe('female');
  });

  it('is case-insensitive and accent-insensitive', () => {
    expect(sexFromFirstName('maría')).toBe('female');
    expect(sexFromFirstName('JOSÉ')).toBe('male');
  });

  it('returns null for explicitly unisex/ambiguous names rather than guessing', () => {
    expect(sexFromFirstName('Jordan')).toBeNull();
    expect(sexFromFirstName('Alex')).toBeNull();
    expect(sexFromFirstName('Taylor')).toBeNull();
    expect(sexFromFirstName('Casey')).toBeNull();
    expect(sexFromFirstName('Andrea')).toBeNull();
  });

  it('returns null for a name not in either list', () => {
    expect(sexFromFirstName('Xylophonius')).toBeNull();
    expect(sexFromFirstName('')).toBeNull();
  });

  it('only looks at the first name token', () => {
    expect(sexFromFirstName('Michael Jordan')).toBe('male');
  });
});
