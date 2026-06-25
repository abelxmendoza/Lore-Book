import { describe, it, expect } from 'vitest';
import { isPlausibleAutoAlias } from '../../src/services/omegaMemoryService';

describe('omega over-merge guard — isPlausibleAutoAlias', () => {
  it('blocks distinct people from being auto-aliased onto an entity (the "Hell Fairy" collapse)', () => {
    const known = ['Hell Fairy', 'Daisy'];
    for (const distinct of ['Abuela', 'Baby Bats', 'Sam', 'Tía Lourdes', 'Mr. Chino', 'Kelly', "abuela's house", 'Tío Juan']) {
      expect(isPlausibleAutoAlias(known, distinct)).toBe(false);
    }
  });

  it('allows typos / near-identical variants that share most characters', () => {
    expect(isPlausibleAutoAlias(['Sarah'], 'Sara')).toBe(true);
    expect(isPlausibleAutoAlias(['Jerry'], 'Jeremy')).toBe(true);
    expect(isPlausibleAutoAlias(['Hell Fairy'], "He'll Fairy")).toBe(true);
    expect(isPlausibleAutoAlias(['Oscuridad'], 'Oscuri')).toBe(true);
  });

  it('matches against ANY known name, not just the primary', () => {
    expect(isPlausibleAutoAlias(['Hell Fairy', 'Daisy'], 'Daisey')).toBe(true); // typo of an alias
    expect(isPlausibleAutoAlias(['Hell Fairy', 'Daisy'], 'Abuela')).toBe(false);
  });

  it('rejects empty / whitespace candidates', () => {
    expect(isPlausibleAutoAlias(['Hell Fairy'], '')).toBe(false);
    expect(isPlausibleAutoAlias(['Hell Fairy'], '   ')).toBe(false);
  });
});
