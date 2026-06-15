import { describe, expect, it } from 'vitest';

import {
  extractSignals,
  confidenceFromEvidence,
  classifyAlignment,
  classifyTrend,
} from '../../src/services/revealedPreference/preferenceTaxonomy';

/** Helper: collect category keys for a given signal type. */
const keys = (text: string, signalType: 'stated' | 'revealed') =>
  extractSignals(text).filter((s) => s.signalType === signalType).map((s) => s.categoryKey);

describe('RevealedPreference — extraction (the prompt examples)', () => {
  it('"I want financial freedom" → STATED goal(financial_freedom)', () => {
    const m = extractSignals('I want financial freedom');
    expect(m).toContainEqual(expect.objectContaining({ categoryKey: 'financial_freedom', signalType: 'stated', type: 'goal' }));
  });

  it('"I spent all weekend building LoreBook" → REVEALED lorebook', () => {
    expect(keys('I spent all weekend building LoreBook', 'revealed')).toContain('lorebook');
  });

  it('"I skipped the party to code" → REVEALED coding, NOT revealed nightlife', () => {
    const revealed = keys('I skipped the party to code', 'revealed');
    expect(revealed).toContain('coding');
    expect(revealed).not.toContain('nightlife'); // skipping a party is not attending one
  });

  it('"I took Abuela to Costco" → REVEALED value(family)', () => {
    const m = extractSignals('I took Abuela to Costco');
    expect(m).toContainEqual(expect.objectContaining({ categoryKey: 'family', signalType: 'revealed', type: 'value' }));
  });

  it('"I keep going to Muay Thai" → REVEALED identity(fitness)', () => {
    const m = extractSignals('I keep going to Muay Thai');
    expect(m).toContainEqual(expect.objectContaining({ categoryKey: 'fitness', signalType: 'revealed', type: 'identity' }));
  });
});

describe('RevealedPreference — stated vs revealed separation', () => {
  it('a stated sentence is not also counted as revealed for the same category', () => {
    const m = extractSignals('Family really matters to me.');
    const family = m.filter((s) => s.categoryKey === 'family');
    expect(family.some((s) => s.signalType === 'stated')).toBe(true);
    expect(family.some((s) => s.signalType === 'revealed')).toBe(false);
  });

  it('separate sentences yield both stated and revealed', () => {
    const m = extractSignals('I value family. Yesterday I called my mom and visited my abuela.');
    expect(m.some((s) => s.categoryKey === 'family' && s.signalType === 'stated')).toBe(true);
    expect(m.some((s) => s.categoryKey === 'family' && s.signalType === 'revealed')).toBe(true);
  });

  it('emits at most one match per (category, signalType) per episode', () => {
    const m = extractSignals('I went to the gym, then trained, then lifted, then did cardio.');
    const fitnessRevealed = m.filter((s) => s.categoryKey === 'fitness' && s.signalType === 'revealed');
    expect(fitnessRevealed.length).toBe(1); // one episode supports a signal once per type
  });
});

describe('RevealedPreference — TRUST invariants', () => {
  it('no signal without evidence: neutral text yields nothing', () => {
    expect(extractSignals('The weather was nice and I had a sandwich.')).toEqual([]);
  });

  it('empty / whitespace text yields nothing', () => {
    expect(extractSignals('')).toEqual([]);
    expect(extractSignals('   \n  ')).toEqual([]);
  });

  it('confidence is 0 with no evidence and rises monotonically, bounded by 1', () => {
    expect(confidenceFromEvidence(0)).toBe(0);
    const c1 = confidenceFromEvidence(1);
    const c5 = confidenceFromEvidence(5);
    const c50 = confidenceFromEvidence(50);
    expect(c1).toBeGreaterThan(0);
    expect(c5).toBeGreaterThan(c1);
    expect(c50).toBeGreaterThan(c5);
    expect(c50).toBeLessThanOrEqual(1);
  });
});

describe('RevealedPreference — alignment classification', () => {
  it('says it but never does it → stated_only (talk, no walk)', () => {
    expect(classifyAlignment({ statedCount: 5, revealedCount: 0, statedShare: 0.5, revealedShare: 0 })).toBe('stated_only');
  });

  it('does it but never says it → revealed_only (the hidden priority)', () => {
    expect(classifyAlignment({ statedCount: 0, revealedCount: 12, statedShare: 0, revealedShare: 0.4 })).toBe('revealed_only');
  });

  it('balanced shares → strongly_aligned', () => {
    expect(classifyAlignment({ statedCount: 4, revealedCount: 10, statedShare: 0.3, revealedShare: 0.31 })).toBe('strongly_aligned');
  });

  it('says much more than does → weakly_aligned', () => {
    expect(classifyAlignment({ statedCount: 8, revealedCount: 1, statedShare: 0.6, revealedShare: 0.05 })).toBe('weakly_aligned');
  });
});

describe('RevealedPreference — trend classification', () => {
  it('rising recent activity → emerging', () => {
    expect(classifyTrend(20, 2, 30, 60).label).toBe('emerging');
  });
  it('falling recent activity → declining', () => {
    expect(classifyTrend(1, 30, 30, 60).label).toBe('declining');
  });
  it('flat → steady', () => {
    expect(classifyTrend(3, 6, 30, 60).label).toBe('steady');
  });
});
