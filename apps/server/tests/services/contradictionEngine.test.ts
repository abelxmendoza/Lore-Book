import { describe, expect, it } from 'vitest';

import {
  classifyDivergence, computeSeverity, detectValueConflicts, buildDetail,
  type SignalView,
} from '../../src/services/contradiction/contradictionDetectors';

const base = (over: Partial<SignalView>): SignalView => ({
  categoryKey: 'x', label: 'X', type: 'value',
  statedCount: 0, revealedCount: 0, statedShare: 0, revealedShare: 0,
  recentRevealed: 0, trend: 0, firstSeen: null, lastSeen: null, ...over,
});

describe('Contradiction — classifyDivergence (the prompt examples)', () => {
  it('"I want to move out" with 0 supporting actions → GOAL_VS_ACTION tension', () => {
    const d = classifyDivergence(base({ type: 'goal', statedCount: 3, revealedCount: 0, statedShare: 0.3, revealedShare: 0 }));
    expect(d.kind).toBe('tension');
    expect(d.contradictionType).toBe('GOAL_VS_ACTION');
  });

  it('"I want a long-term relationship" but mostly casual → IDENTITY_VS_BEHAVIOR (identity_conflict)', () => {
    const d = classifyDivergence(base({ type: 'identity', statedCount: 4, revealedCount: 1, statedShare: 0.4, revealedShare: 0.05 }));
    expect(d.kind).toBe('tension');
    expect(d.contradictionType).toBe('IDENTITY_VS_BEHAVIOR');
    expect(d.section).toBe('identity_conflict');
  });

  it('"Fitness is important" with high support → NO contradiction (aligned)', () => {
    const d = classifyDivergence(base({ type: 'value', statedCount: 5, revealedCount: 12, statedShare: 0.3, revealedShare: 0.32 }));
    expect(d.kind).toBe('aligned');
    expect(d.contradictionType).toBeUndefined();
  });

  it('does it a lot, never says it → blind_spot (IDENTITY_VS_BEHAVIOR)', () => {
    const d = classifyDivergence(base({ type: 'value', statedCount: 0, revealedCount: 18, statedShare: 0, revealedShare: 0.27 }));
    expect(d.kind).toBe('blind_spot');
    expect(d.section).toBe('blind_spot');
  });

  it('a stated goal acted on before but not recently → INTENTION_OUTCOME', () => {
    const d = classifyDivergence(base({ type: 'goal', statedCount: 3, revealedCount: 2, statedShare: 0.3, revealedShare: 0.05, recentRevealed: 0 }));
    expect(d.contradictionType).toBe('INTENTION_OUTCOME');
  });
});

describe('Contradiction — TRUST: insufficient evidence never becomes a contradiction', () => {
  it('thin revealed with no stated → insufficient (not a blind spot)', () => {
    expect(classifyDivergence(base({ statedCount: 0, revealedCount: 2, revealedShare: 0.05 })).kind).toBe('insufficient');
  });
  it('nothing at all → insufficient', () => {
    expect(classifyDivergence(base({})).kind).toBe('insufficient');
  });
  it('detail language is non-accusatory ("evidence suggests", no "you fail")', () => {
    const text = [
      buildDetail('tension', 'Fitness', 4, 1),
      buildDetail('blind_spot', 'Family', 0, 18),
      buildDetail('identity_conflict', 'Athlete', 3, 0),
      buildDetail('value_conflict', 'Family', 2, 11, 'Career'),
    ].join(' ').toLowerCase();
    expect(text).toContain('evidence suggests');
    expect(text).not.toMatch(/\byou (fail|neglect|are bad|never care)\b/);
  });
});

describe('Contradiction — severity', () => {
  it('high evidence + big gap + recent + persistent → high', () => {
    expect(computeSeverity({ evidenceCount: 18, alignmentDelta: 0.3, recentRevealed: 5, durationDays: 200 }).severity).toBe('high');
  });
  it('thin, stale → low', () => {
    expect(computeSeverity({ evidenceCount: 1, alignmentDelta: 0.02, recentRevealed: 0, durationDays: 1 }).severity).toBe('low');
  });
  it('severity is monotonic in evidence', () => {
    const a = computeSeverity({ evidenceCount: 2, alignmentDelta: 0.1, recentRevealed: 0, durationDays: 10 }).score;
    const b = computeSeverity({ evidenceCount: 12, alignmentDelta: 0.1, recentRevealed: 0, durationDays: 10 }).score;
    expect(b).toBeGreaterThan(a);
  });
});

describe('Contradiction — value conflicts (require a stated value; never speculative)', () => {
  const mk = (over: Partial<SignalView>) => base(over);
  it('stated value with a time-dominant rival → conflict', () => {
    const byKey = new Map<string, SignalView>([
      ['family', mk({ categoryKey: 'family', label: 'Family', statedCount: 3, revealedCount: 2, statedShare: 0.3, revealedShare: 0.1 })],
      ['career', mk({ categoryKey: 'career', label: 'Career', statedCount: 0, revealedCount: 10, revealedShare: 0.4 })],
    ]);
    const conflicts = detectValueConflicts(byKey);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ categoryKey: 'family', conflictWith: 'career' });
  });

  it('no stated value → no conflict (not speculative)', () => {
    const byKey = new Map<string, SignalView>([
      ['family', mk({ categoryKey: 'family', label: 'Family', statedCount: 0, revealedCount: 2, revealedShare: 0.1 })],
      ['career', mk({ categoryKey: 'career', label: 'Career', statedCount: 0, revealedCount: 10, revealedShare: 0.4 })],
    ]);
    expect(detectValueConflicts(byKey)).toHaveLength(0);
  });
});
