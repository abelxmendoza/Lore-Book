import { describe, it, expect } from 'vitest';
import { expDecay, daysBetween } from './timeUtils';

describe('timeUtils', () => {
  describe('expDecay', () => {
    it('returns 1 when daysSince is 0', () => {
      expect(expDecay(0, 60)).toBe(1);
    });

    it('returns ~0.5 at halfLifeDays', () => {
      const v = expDecay(60, 60);
      expect(v).toBeGreaterThan(0.49);
      expect(v).toBeLessThan(0.51);
    });

    it('returns ~0.25 at 2 * halfLifeDays', () => {
      const v = expDecay(120, 60);
      expect(v).toBeGreaterThan(0.24);
      expect(v).toBeLessThan(0.26);
    });

    it('decays toward 0 as daysSince increases', () => {
      expect(expDecay(0, 60)).toBeGreaterThan(expDecay(30, 60));
      expect(expDecay(30, 60)).toBeGreaterThan(expDecay(60, 60));
      expect(expDecay(60, 60)).toBeGreaterThan(expDecay(180, 60));
      // With halfLife 60, 365 days yields small value (formula-dependent)
      expect(expDecay(365, 60)).toBeLessThan(0.02);
    });

    it('returns 0 when halfLifeDays is 0', () => {
      expect(expDecay(10, 0)).toBe(0);
    });
  });

  describe('daysBetween', () => {
    it('returns 0 when dates are the same', () => {
      const d = '2024-06-15T12:00:00Z';
      expect(daysBetween(d, d)).toBe(0);
    });

    it('returns positive when b is after a', () => {
      expect(daysBetween('2024-01-01', '2024-01-11')).toBe(10);
      expect(daysBetween('2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).toBe(1);
    });

    it('returns negative when b is before a', () => {
      expect(daysBetween('2024-01-11', '2024-01-01')).toBe(-10);
    });

    it('accepts Date objects', () => {
      const a = new Date('2024-01-01');
      const b = new Date('2024-01-31');
      expect(daysBetween(a, b)).toBe(30);
    });
  });
});
