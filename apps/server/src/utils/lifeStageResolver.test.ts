import { describe, expect, it } from 'vitest';

import {
  resolveLifeStageAnchor,
  hasLifeStageCue,
  extractBirthYearFromText,
} from './lifeStageResolver';

const PROFILE = { birthYear: 1995 };
const NOW = new Date(2026, 5, 19);

describe('resolveLifeStageAnchor', () => {
  it('resolves "when I was 19" to birthYear + 19', () => {
    const w = resolveLifeStageAnchor('I dropped out when I was 19', PROFILE, NOW);
    expect(w).not.toBeNull();
    expect(w!.start.getFullYear()).toBe(2014); // 1995 + 19
    expect(w!.end.getFullYear()).toBe(2014);
    expect(w!.precision).toBe('year');
  });

  it('handles "at age 25" / "25 years old"', () => {
    expect(resolveLifeStageAnchor('at age 25 I moved', PROFILE, NOW)!.start.getFullYear()).toBe(2020);
    expect(resolveLifeStageAnchor('I was 30 years old then', PROFILE, NOW)!.start.getFullYear()).toBe(2025);
  });

  it('resolves "in high school" to the teen age band', () => {
    const w = resolveLifeStageAnchor('back in high school', PROFILE, NOW)!;
    expect(w.start.getFullYear()).toBe(2009); // 1995 + 14
    expect(w.end.getFullYear()).toBe(2012);   // 1995 + 17
  });

  it('resolves "in college"', () => {
    const w = resolveLifeStageAnchor('I met her in college', PROFILE, NOW)!;
    expect(w.start.getFullYear()).toBe(2013); // 1995 + 18
    expect(w.end.getFullYear()).toBe(2016);   // 1995 + 21
  });

  it('uses college context for "sophomore year"', () => {
    const w = resolveLifeStageAnchor('sophomore year of college', PROFILE, NOW)!;
    expect(w.start.getFullYear()).toBe(2014); // 1995 + 18 + 1
    expect(w.confidence).toBeGreaterThan(0.6);
  });

  it('defaults sophomore year to high school (lower confidence) when unspecified', () => {
    const w = resolveLifeStageAnchor('sophomore year was rough', PROFILE, NOW)!;
    expect(w.start.getFullYear()).toBe(2010); // 1995 + 14 + 1
    expect(w.confidence).toBeLessThan(0.6);
  });

  it('resolves decade-of-life "in my late twenties"', () => {
    const w = resolveLifeStageAnchor('in my late twenties', PROFILE, NOW)!;
    expect(w.start.getFullYear()).toBe(2022); // 1995 + 27
    expect(w.end.getFullYear()).toBe(2024);   // 1995 + 29
  });

  it('resolves the pandemic WITHOUT a birth year', () => {
    const w = resolveLifeStageAnchor('I started baking during the pandemic', {}, NOW)!;
    expect(w).not.toBeNull();
    expect(w.start.getFullYear()).toBe(2020);
    expect(w.end.getFullYear()).toBe(2021);
  });

  it('returns null for age phrasing with no birth year', () => {
    expect(resolveLifeStageAnchor('when I was 19', {}, NOW)).toBeNull();
  });

  it('returns null for non-temporal text', () => {
    expect(resolveLifeStageAnchor('had coffee with Maria', PROFILE, NOW)).toBeNull();
  });
});

describe('hasLifeStageCue', () => {
  it.each([
    'when I was 19',
    'in high school',
    'during the pandemic',
    'my sophomore year',
    'in my twenties',
    '25 years old',
  ])('detects "%s"', (text) => {
    expect(hasLifeStageCue(text)).toBe(true);
  });

  it.each(['had a great workout', 'thanks!', 'met Maria for lunch'])('skips "%s"', (text) => {
    expect(hasLifeStageCue(text)).toBe(false);
  });
});

describe('extractBirthYearFromText', () => {
  it('extracts "born in 1995" at high confidence', () => {
    const r = extractBirthYearFromText('I was born in 1995', NOW)!;
    expect(r.birthYear).toBe(1995);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('derives birth year from present-tense age "I\'m 28"', () => {
    const r = extractBirthYearFromText("I'm 28", NOW)!;
    expect(r.birthYear).toBe(1998); // 2026 - 28
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('ignores implausible years', () => {
    expect(extractBirthYearFromText('born in 1850', NOW)).toBeNull();
  });

  it('returns null when no birth signal', () => {
    expect(extractBirthYearFromText('I went to the store', NOW)).toBeNull();
  });
});
