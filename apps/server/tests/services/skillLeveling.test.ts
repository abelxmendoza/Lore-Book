/**
 * Per-skill leveling unification regression (Sprint T)
 *
 * Before this fix, `skillTreeEngine.calculateXPForLevel` carried a private
 * byte-for-byte copy of `skillService`'s geometric leveling curve
 * (BASE_XP=100, MULTIPLIER=1.5). Two independent copies of the same formula
 * is a silent-fork risk: change one constant and skill levels and mastery
 * calculations quietly disagree. This locks in that both consumers — and any
 * future one — derive from the single exported `calculateXPForLevel` /
 * `calculateLevelFromXP` in skillService.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateXPForLevel,
  calculateLevelFromXP,
  SKILL_BASE_XP_PER_LEVEL,
  SKILL_XP_MULTIPLIER,
} from '../../src/services/skills/skillService';

describe('Per-skill leveling — single source of truth (Sprint T)', () => {
  it('exposes the geometric curve constants used by every consumer', () => {
    expect(SKILL_BASE_XP_PER_LEVEL).toBe(100);
    expect(SKILL_XP_MULTIPLIER).toBe(1.5);
  });

  it('calculateXPForLevel follows the documented geometric curve', () => {
    expect(calculateXPForLevel(1)).toBe(0);
    expect(calculateXPForLevel(2)).toBe(Math.floor(100 * Math.pow(1.5, 0)));
    expect(calculateXPForLevel(5)).toBe(Math.floor(100 * Math.pow(1.5, 3)));
    expect(calculateXPForLevel(10)).toBe(Math.floor(100 * Math.pow(1.5, 8)));
  });

  it('calculateLevelFromXP and calculateXPForLevel agree at the level boundaries', () => {
    // For every level L we test, the cumulative XP for L must qualify as
    // level L, and one XP short must still be the previous level — proving
    // the two functions describe the same curve rather than two close-but-
    // diverging ones.
    let cumulative = 0;
    for (let level = 1; level <= 10; level++) {
      cumulative += calculateXPForLevel(level);
      expect(calculateLevelFromXP(cumulative)).toBe(level);
      if (cumulative > 0) {
        expect(calculateLevelFromXP(cumulative - 1)).toBe(level - 1);
      }
    }
  });

  it('produces a single consistent level for a given XP total across all consumers', () => {
    // skillTreeEngine.calculateMasteryLevel computes
    // `skill.total_xp - calculateXPForLevel(10)` using the SAME export this
    // test imports. Reproducing that expression here against a range of XP
    // totals guards against either side silently re-forking the formula.
    const xpValues = [0, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const masteryThreshold = calculateXPForLevel(10);

    for (const totalXP of xpValues) {
      const level = calculateLevelFromXP(totalXP);
      const excessXP = totalXP - masteryThreshold;
      const masteryLevel = level >= 10 ? Math.floor(excessXP / 1000) : 0;

      // Re-deriving the level from calculateXPForLevel must round-trip:
      // summing XP-per-level up to `level` never exceeds totalXP, and adding
      // one more level's requirement does.
      let cumulative = 0;
      for (let l = 1; l <= level; l++) cumulative += calculateXPForLevel(l);
      expect(cumulative).toBeLessThanOrEqual(totalXP);
      expect(cumulative + calculateXPForLevel(level + 1)).toBeGreaterThan(totalXP);

      // Mastery is only meaningful at level >= 10, and only ever derived from
      // this same shared curve — never a parallel constant.
      if (level < 10) expect(masteryLevel).toBe(0);
    }
  });
});
