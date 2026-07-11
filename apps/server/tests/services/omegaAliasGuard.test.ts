import { describe, it, expect } from 'vitest';
import { isPlausibleAutoAlias } from '../../src/services/omegaMemoryService';

describe('omega over-merge guard — isPlausibleAutoAlias', () => {
  it('blocks distinct people from being auto-aliased onto an entity (the "Moth Queen" collapse)', () => {
    const known = ['Moth Queen', 'Daisy'];
    for (const distinct of ['Abuela', 'Neon Newts', 'Sam', 'Tía Lourdes', 'Mr. Chino', 'Kelly', "abuela's house", 'Tío Rafa']) {
      expect(isPlausibleAutoAlias(known, distinct)).toBe(false);
    }
  });

  it('allows typos / near-identical variants that share most characters', () => {
    expect(isPlausibleAutoAlias(['Sarah'], 'Sara')).toBe(true);
    expect(isPlausibleAutoAlias(['Jerry'], 'Jeremy')).toBe(true);
    expect(isPlausibleAutoAlias(['Moth Queen'], 'Moth Quen')).toBe(true);
    expect(isPlausibleAutoAlias(['Obscurio'], 'Oscuri')).toBe(true);
  });

  it('matches against ANY known name, not just the primary', () => {
    expect(isPlausibleAutoAlias(['Moth Queen', 'Daisy'], 'Daisey')).toBe(true); // typo of an alias
    expect(isPlausibleAutoAlias(['Moth Queen', 'Daisy'], 'Abuela')).toBe(false);
  });

  it('rejects empty / whitespace candidates', () => {
    expect(isPlausibleAutoAlias(['Moth Queen'], '')).toBe(false);
    expect(isPlausibleAutoAlias(['Moth Queen'], '   ')).toBe(false);
  });
});
