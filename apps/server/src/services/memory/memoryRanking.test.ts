import { describe, it, expect } from 'vitest';

import {
  recencyScore,
  lifecycleMultiplier,
  scoreMemory,
  rankMemories,
  selectWithinBudget,
  rankAndSelect,
  DEFAULT_HALF_LIFE_MS,
  type RankableMemory,
} from './memoryRanking';

const mem = (over: Partial<RankableMemory>): RankableMemory => ({
  id: 'm',
  ageMs: 0,
  relevance: 0.5,
  confidence: 0.5,
  importance: 0.5,
  userConfirmed: false,
  lifecycleState: 'active',
  ...over,
});

describe('recencyScore (exponential decay)', () => {
  it('is 1 at age 0 and 0.5 at one half-life', () => {
    expect(recencyScore(0)).toBe(1);
    expect(recencyScore(DEFAULT_HALF_LIFE_MS)).toBeCloseTo(0.5, 6);
    expect(recencyScore(2 * DEFAULT_HALF_LIFE_MS)).toBeCloseTo(0.25, 6);
  });

  it('is monotonically decreasing and bounded in [0,1]', () => {
    expect(recencyScore(DEFAULT_HALF_LIFE_MS)).toBeLessThan(recencyScore(DEFAULT_HALF_LIFE_MS / 2));
    expect(recencyScore(10 * DEFAULT_HALF_LIFE_MS)).toBeGreaterThan(0); // ~2^-10, still positive
    expect(recencyScore(1e18)).toBeGreaterThanOrEqual(0); // extreme age underflows to 0 (the limit)
  });

  it('handles degenerate input', () => {
    expect(recencyScore(-100)).toBe(1);
    expect(recencyScore(NaN)).toBe(1);
    expect(recencyScore(1000, 0)).toBe(0);
  });
});

describe('lifecycleMultiplier (gating)', () => {
  it('gates superseded truth and excludes terminal states', () => {
    expect(lifecycleMultiplier('active')).toBe(1);
    expect(lifecycleMultiplier('contradicted')).toBe(0.4);
    expect(lifecycleMultiplier('outdated')).toBe(0.25);
    expect(lifecycleMultiplier('corrected')).toBe(0);
    expect(lifecycleMultiplier('retracted')).toBe(0);
  });

  it('does not penalize unknown/legacy rows', () => {
    expect(lifecycleMultiplier(null)).toBe(1);
    expect(lifecycleMultiplier('nonsense')).toBe(1);
  });
});

describe('scoreMemory', () => {
  it('returns a normalized score in [0,1] for an active, perfectly-relevant memory', () => {
    const s = scoreMemory(mem({ ageMs: 0, relevance: 1, confidence: 1, importance: 1, userConfirmed: true }));
    expect(s).toBeCloseTo(1, 6);
  });

  it('user-confirmed truth outranks an unconfirmed but otherwise-equal memory', () => {
    const confirmed = scoreMemory(mem({ userConfirmed: true }));
    const unconfirmed = scoreMemory(mem({ userConfirmed: false }));
    expect(confirmed).toBeGreaterThan(unconfirmed);
  });

  it('older memories score lower (recency decay)', () => {
    const fresh = scoreMemory(mem({ ageMs: 0 }));
    const old = scoreMemory(mem({ ageMs: 10 * DEFAULT_HALF_LIFE_MS }));
    expect(fresh).toBeGreaterThan(old);
  });

  it('corrected/retracted memories score 0 (excluded from truth)', () => {
    expect(scoreMemory(mem({ relevance: 1, confidence: 1, lifecycleState: 'corrected' }))).toBe(0);
    expect(scoreMemory(mem({ relevance: 1, confidence: 1, lifecycleState: 'retracted' }))).toBe(0);
  });

  it('clamps out-of-range feature values', () => {
    const s = scoreMemory(mem({ relevance: 5, confidence: -2, importance: NaN }));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('respects custom weights (relevance-only)', () => {
    const opts = { weights: { recency: 0, relevance: 1, confidence: 0, importance: 0, userConfirmed: 0 } };
    expect(scoreMemory(mem({ relevance: 0.8, ageMs: 1e12 }), opts)).toBeCloseTo(0.8, 6);
  });

  it('returns 0 when all weights are zero (no divide-by-zero)', () => {
    expect(
      scoreMemory(mem({}), { weights: { recency: 0, relevance: 0, confidence: 0, importance: 0, userConfirmed: 0 } })
    ).toBe(0);
  });
});

describe('rankMemories', () => {
  it('sorts by score descending and drops zero-scored (terminal) memories', () => {
    const ranked = rankMemories([
      mem({ id: 'low', relevance: 0.1, ageMs: 5 * DEFAULT_HALF_LIFE_MS }),
      mem({ id: 'high', relevance: 1, confidence: 1, importance: 1, userConfirmed: true }),
      mem({ id: 'dead', relevance: 1, lifecycleState: 'retracted' }),
    ]);
    expect(ranked.map((r) => r.memory.id)).toEqual(['high', 'low']);
    expect(ranked.find((r) => r.memory.id === 'dead')).toBeUndefined();
  });

  it('can include zero-scored memories when asked', () => {
    const ranked = rankMemories([mem({ lifecycleState: 'retracted' })], { includeZero: true });
    expect(ranked).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(rankMemories([])).toEqual([]);
  });
});

describe('selectWithinBudget + rankAndSelect', () => {
  it('greedily packs the highest-scoring memories within the byte budget', () => {
    const ranked = rankMemories([
      mem({ id: 'a', relevance: 1, weight: 60 }),
      mem({ id: 'b', relevance: 0.9, weight: 60 }),
      mem({ id: 'c', relevance: 0.8, weight: 30 }),
    ]);
    // budget 100: take a(60), skip b(would be 120), take c(90)
    expect(selectWithinBudget(ranked, 100).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('rankAndSelect composes ranking + budgeting', () => {
    const out = rankAndSelect(
      [mem({ id: 'x', relevance: 1, weight: 50 }), mem({ id: 'y', relevance: 0.1, weight: 50 })],
      50
    );
    expect(out.map((m) => m.id)).toEqual(['x']);
  });

  it('returns everything when the budget is ample', () => {
    const ranked = rankMemories([mem({ id: 'a', weight: 10 }), mem({ id: 'b', weight: 10 })]);
    expect(selectWithinBudget(ranked, 1000)).toHaveLength(2);
  });
});
