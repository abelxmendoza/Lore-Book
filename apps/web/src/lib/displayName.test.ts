import { describe, it, expect } from 'vitest';

import { shortDisplayName, isBareTitleName, shortPossessive } from './displayName';

describe('shortDisplayName', () => {
  it('shortens ordinary given names', () => {
    expect(shortDisplayName('John Smith')).toBe('John');
    expect(shortDisplayName('Leslie')).toBe('Leslie');
  });

  it('never strands a title without its name', () => {
    expect(shortDisplayName('Tio Ralph')).toBe('Tio Ralph');
    expect(shortDisplayName('Tía Grace')).toBe('Tía Grace');
    expect(shortDisplayName('Mr. Chen')).toBe('Mr. Chen');
    expect(shortDisplayName('Dr. Amy Wu')).toBe('Dr. Amy');
    expect(shortDisplayName('Professor Oak')).toBe('Professor Oak');
    expect(shortDisplayName('Abuela Rosa')).toBe('Abuela Rosa');
  });

  it('keeps stage and persona names whole', () => {
    expect(shortDisplayName('Hell Fairy')).toBe('Hell Fairy');
    expect(shortDisplayName('Moth Queen')).toBe('Moth Queen');
    expect(shortDisplayName('Neon Newts')).toBe('Neon Newts');
    expect(shortDisplayName('DJ Vex')).toBe('DJ Vex');
  });

  it('handles empty input', () => {
    expect(shortDisplayName('')).toBe('');
    expect(shortDisplayName(undefined)).toBe('');
  });
});

describe('isBareTitleName', () => {
  it('flags names that are only titles', () => {
    expect(isBareTitleName('Mr')).toBe(true);
    expect(isBareTitleName('Mr.')).toBe(true);
    expect(isBareTitleName('Tio')).toBe(true);
    expect(isBareTitleName('Tía')).toBe(true);
    expect(isBareTitleName('Uncle')).toBe(true);
    expect(isBareTitleName('')).toBe(true);
  });

  it('passes names with real name tokens', () => {
    expect(isBareTitleName('Tio Ralph')).toBe(false);
    expect(isBareTitleName('Hell Fairy')).toBe(false);
    expect(isBareTitleName('Leslie')).toBe(false);
  });
});

describe('shortPossessive', () => {
  it('builds possessives on the safe short form', () => {
    expect(shortPossessive('Hell Fairy')).toBe("Hell Fairy's");
    expect(shortPossessive('Tio Ralph')).toBe("Tio Ralph's");
    expect(shortPossessive('John Smith')).toBe("John's");
    expect(shortPossessive('Neon Newts')).toBe("Neon Newts'");
  });
});
