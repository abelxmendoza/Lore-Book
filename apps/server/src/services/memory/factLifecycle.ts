// =====================================================
// FACT LIFECYCLE — Durable Memory Architecture, Slice 3
//
// Pure state machine for a claim's epistemic lifecycle. The guiding rule:
// older truth is never erased — it is superseded forward into a settled state.
// This module has no I/O so it is fully unit-testable and is the single source
// of truth for which transitions are allowed.
// =====================================================

export const FACT_LIFECYCLE_STATES = [
  'active', // current best belief
  'outdated', // superseded by newer evidence (was true then)
  'contradicted', // conflicting evidence exists; needs resolution
  'retracted', // explicitly removed ("this never happened") — terminal
  'corrected', // replaced by a corrected value (new active claim created) — terminal
] as const;

export type FactLifecycleState = (typeof FACT_LIFECYCLE_STATES)[number];

export const FACT_LIFECYCLE_ACTIONS = [
  'confirm', // new evidence re-affirms this claim
  'supersede', // newer evidence replaces it (a separate active claim is created)
  'contradict', // conflicting evidence found
  'retract', // user removes it
  'correct', // user supplies the right value
] as const;

export type FactLifecycleAction = (typeof FACT_LIFECYCLE_ACTIONS)[number];

/** Terminal states never transition again — re-asserting creates a NEW claim. */
const TERMINAL: ReadonlySet<FactLifecycleState> = new Set(['retracted', 'corrected']);

/**
 * Allowed transitions. Absent (state, action) pairs are invalid (no-op for the
 * caller). Note `confirm` from `outdated`/`contradicted` reactivates to `active`
 * — recovering a belief is allowed; resurrecting a retracted/corrected one is not.
 */
const TRANSITIONS: Record<FactLifecycleState, Partial<Record<FactLifecycleAction, FactLifecycleState>>> = {
  active: {
    confirm: 'active',
    supersede: 'outdated',
    contradict: 'contradicted',
    retract: 'retracted',
    correct: 'corrected',
  },
  outdated: {
    confirm: 'active',
    contradict: 'contradicted',
    retract: 'retracted',
    correct: 'corrected',
  },
  contradicted: {
    confirm: 'active',
    supersede: 'outdated',
    retract: 'retracted',
    correct: 'corrected',
  },
  retracted: {}, // terminal
  corrected: {}, // terminal
};

export function isLifecycleState(value: unknown): value is FactLifecycleState {
  return typeof value === 'string' && (FACT_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isTerminalLifecycleState(state: FactLifecycleState): boolean {
  return TERMINAL.has(state);
}

/**
 * The next state for (current, action), or `null` if the transition is not
 * allowed. Never throws — callers no-op on null rather than corrupting state.
 */
export function nextLifecycleState(
  current: FactLifecycleState,
  action: FactLifecycleAction
): FactLifecycleState | null {
  return TRANSITIONS[current]?.[action] ?? null;
}

/**
 * Apply an action, returning the new state — or the unchanged current state when
 * the transition is invalid (safe no-op). Use `nextLifecycleState` when you need
 * to detect/branch on invalid transitions.
 */
export function applyLifecycleAction(
  current: FactLifecycleState,
  action: FactLifecycleAction
): FactLifecycleState {
  return nextLifecycleState(current, action) ?? current;
}

/** Whether a claim in this state should count as current truth for retrieval. */
export function isLiveTruth(state: FactLifecycleState): boolean {
  return state === 'active';
}

const LABELS: Record<FactLifecycleState, string> = {
  active: 'Active',
  outdated: 'No longer current',
  contradicted: 'Conflicting evidence',
  retracted: 'Retracted',
  corrected: 'Corrected',
};

export function lifecycleLabel(state: FactLifecycleState): string {
  return LABELS[state];
}
