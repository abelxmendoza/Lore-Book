import { describe, it, expect } from 'vitest';

import {
  nextLifecycleState,
  applyLifecycleAction,
  isTerminalLifecycleState,
  isLifecycleState,
  isLiveTruth,
  lifecycleLabel,
  FACT_LIFECYCLE_STATES,
  FACT_LIFECYCLE_ACTIONS,
  type FactLifecycleState,
} from './factLifecycle';

describe('factLifecycle — valid transitions', () => {
  it('active supports the full set of forward transitions', () => {
    expect(nextLifecycleState('active', 'confirm')).toBe('active');
    expect(nextLifecycleState('active', 'supersede')).toBe('outdated');
    expect(nextLifecycleState('active', 'contradict')).toBe('contradicted');
    expect(nextLifecycleState('active', 'retract')).toBe('retracted');
    expect(nextLifecycleState('active', 'correct')).toBe('corrected');
  });

  it('confirm reactivates an outdated or contradicted claim (belief recovery)', () => {
    expect(nextLifecycleState('outdated', 'confirm')).toBe('active');
    expect(nextLifecycleState('contradicted', 'confirm')).toBe('active');
  });

  it('retract from any non-terminal state lands on retracted', () => {
    for (const s of ['active', 'outdated', 'contradicted'] as FactLifecycleState[]) {
      expect(nextLifecycleState(s, 'retract')).toBe('retracted');
    }
  });
});

describe('factLifecycle — terminal states never resurrect', () => {
  it('retracted and corrected are terminal for every action', () => {
    for (const action of FACT_LIFECYCLE_ACTIONS) {
      expect(nextLifecycleState('retracted', action)).toBeNull();
      expect(nextLifecycleState('corrected', action)).toBeNull();
    }
    expect(isTerminalLifecycleState('retracted')).toBe(true);
    expect(isTerminalLifecycleState('corrected')).toBe(true);
    expect(isTerminalLifecycleState('active')).toBe(false);
  });

  it('cannot supersede an already-outdated claim (no supersede from outdated)', () => {
    expect(nextLifecycleState('outdated', 'supersede')).toBeNull();
  });
});

describe('factLifecycle — applyLifecycleAction (safe no-op)', () => {
  it('returns the new state on valid transitions', () => {
    expect(applyLifecycleAction('active', 'supersede')).toBe('outdated');
  });

  it('returns the unchanged state on invalid transitions', () => {
    expect(applyLifecycleAction('retracted', 'confirm')).toBe('retracted');
    expect(applyLifecycleAction('outdated', 'supersede')).toBe('outdated');
  });
});

describe('factLifecycle — helpers', () => {
  it('only active counts as live truth for retrieval', () => {
    expect(isLiveTruth('active')).toBe(true);
    for (const s of ['outdated', 'contradicted', 'retracted', 'corrected'] as FactLifecycleState[]) {
      expect(isLiveTruth(s)).toBe(false);
    }
  });

  it('validates and labels every declared state', () => {
    for (const s of FACT_LIFECYCLE_STATES) {
      expect(isLifecycleState(s)).toBe(true);
      expect(typeof lifecycleLabel(s)).toBe('string');
    }
    expect(isLifecycleState('nonsense')).toBe(false);
    expect(isLifecycleState(undefined)).toBe(false);
  });
});
