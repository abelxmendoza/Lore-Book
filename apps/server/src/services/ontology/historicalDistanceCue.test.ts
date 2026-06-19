import { describe, expect, it } from 'vitest';

import { hasHistoricalDistanceCue } from './temporalLexicon';

describe('hasHistoricalDistanceCue', () => {
  describe('flags historical-but-undated statements (occurrence must NOT default to now)', () => {
    it.each([
      'I used to live in Chicago',
      'back then we were inseparable',
      'we were close back when I worked there',
      'growing up, money was tight',
      'my dad and I were close in those days',
      'I moved around a lot years ago',
      'when I was younger I played guitar',
      'in my twenties I traveled constantly',
      'that bar used to be a record store',
    ])('flags: "%s"', (text) => {
      expect(hasHistoricalDistanceCue(text)).toBe(true);
    });
  });

  describe('does NOT flag recent/present statements (now is a fair estimate)', () => {
    it.each([
      'had coffee with Maria',
      'just finished a workout',
      'I went to the gym this morning',
      'feeling good today',
      'we are meeting for lunch',
      'I broke up with him',          // recent past, no historical distance
    ])('skips: "%s"', (text) => {
      expect(hasHistoricalDistanceCue(text)).toBe(false);
    });
  });

  it('handles empty input', () => {
    expect(hasHistoricalDistanceCue('')).toBe(false);
  });
});
