/**
 * Planner heuristics — data-driven planning rules.
 *
 * Planning decisions live in this table, not in switch statements. Each rule
 * describes the stage lineup for a QueryType: priority tiers (lower runs
 * first; same tier runs in parallel) and evidence conditions that make
 * execution adaptive ("semantic only if structured left confidence low").
 *
 * The stage lineups preserve the Phase 1 executor order exactly — Phase 2
 * adds WHEN each stage may run, not WHAT runs.
 */

import {
  QueryType,
  type ExecutorKind,
  type ExecutorProfile,
  type PlanStage,
  type StageCondition,
} from './QueryTypes';

/** Default cost/value profiles per executor kind. Rough, tunable, and only
 *  used for ordering + observability — never for correctness. */
export const EXECUTOR_PROFILES: Record<ExecutorKind, ExecutorProfile> = {
  structured:     { estimatedLatencyMs: 120, estimatedTokenCost: 0,   expectedConfidenceGain: 0.9,  cacheable: true,  priority: 1 },
  thread:         { estimatedLatencyMs: 60,  estimatedTokenCost: 0,   expectedConfidenceGain: 0.85, cacheable: false, priority: 0 },
  crystallized:   { estimatedLatencyMs: 90,  estimatedTokenCost: 0,   expectedConfidenceGain: 0.5,  cacheable: true,  priority: 2 },
  semantic:       { estimatedLatencyMs: 450, estimatedTokenCost: 400, expectedConfidenceGain: 0.6,  cacheable: false, priority: 3 },
  working_memory: { estimatedLatencyMs: 350, estimatedTokenCost: 0,   expectedConfidenceGain: 0.4,  cacheable: true,  priority: 2 },
  graph:          { estimatedLatencyMs: 150, estimatedTokenCost: 0,   expectedConfidenceGain: 0.7,  cacheable: true,  priority: 2 },
  timeline:       { estimatedLatencyMs: 150, estimatedTokenCost: 0,   expectedConfidenceGain: 0.6,  cacheable: true,  priority: 1 },
  analytics:      { estimatedLatencyMs: 200, estimatedTokenCost: 0,   expectedConfidenceGain: 0.5,  cacheable: true,  priority: 3 },
};

type StageRule = {
  kind: ExecutorKind;
  source?: string;
  placeholder?: boolean;
  runIf?: StageCondition;
  /** Override the profile's default priority for this intent. */
  priority?: number;
};

/** The rule table. Order within a rule = flat executor order (compat). */
export const PLANNING_RULES: Record<QueryType, StageRule[]> = {
  // prefer structured; claims only when structured left confidence low; never semantic first
  [QueryType.IDENTITY]: [
    { kind: 'structured', source: 'characters', priority: 1 },
    { kind: 'crystallized', source: 'omega_claims', priority: 2, runIf: 'if_low_confidence' },
  ],
  [QueryType.RELATIONSHIP]: [
    { kind: 'structured', source: 'relationships', priority: 1 },
    { kind: 'graph', placeholder: true, priority: 2 },
  ],
  // timeline → structured → semantic
  [QueryType.TIMELINE]: [
    { kind: 'structured', source: 'resolved_events', priority: 1 },
    { kind: 'timeline', placeholder: true, priority: 1 },
    { kind: 'semantic', source: 'journal_entries', priority: 2, runIf: 'if_low_confidence' },
  ],
  [QueryType.LOCATION]: [{ kind: 'structured', source: 'locations', priority: 1 }],
  [QueryType.ORGANIZATION]: [{ kind: 'structured', source: 'organizations', priority: 1 }],
  [QueryType.ATTRIBUTE]: [
    { kind: 'structured', source: 'characters', priority: 1 },
    { kind: 'crystallized', source: 'omega_claims', priority: 2, runIf: 'if_low_confidence' },
  ],
  // structured → claims → semantic
  [QueryType.COMPARISON]: [
    { kind: 'structured', source: 'characters', priority: 1 },
    { kind: 'semantic', source: 'journal_entries', priority: 2, runIf: 'if_low_confidence' },
    { kind: 'analytics', placeholder: true, priority: 3 },
  ],
  [QueryType.AGGREGATE]: [
    { kind: 'structured', source: 'characters', priority: 1 },
    { kind: 'analytics', placeholder: true, priority: 2 },
  ],
  [QueryType.NARRATIVE]: [
    { kind: 'structured', source: 'characters', priority: 1 },
    { kind: 'semantic', source: 'journal_entries', priority: 1 },
    { kind: 'timeline', placeholder: true, priority: 2 },
  ],
  [QueryType.CAUSAL]: [{ kind: 'semantic', source: 'journal_entries', priority: 1 }],
  [QueryType.SEMANTIC]: [{ kind: 'semantic', source: 'journal_entries', priority: 1 }],
  // structured → graph → semantic (only if needed)
  [QueryType.GRAPH]: [
    { kind: 'structured', source: 'relationships', priority: 1 },
    { kind: 'graph', placeholder: true, priority: 2 },
    { kind: 'semantic', source: 'journal_entries', priority: 3, runIf: 'if_no_records' },
  ],
  [QueryType.WORKING_MEMORY]: [
    { kind: 'thread', source: 'conversation', priority: 0 },
    { kind: 'working_memory', priority: 1, runIf: 'if_low_confidence' },
  ],
  [QueryType.KNOWLEDGE_GAP]: [{ kind: 'structured', source: 'characters', priority: 1 }],
  [QueryType.UNKNOWN]: [{ kind: 'semantic', source: 'journal_entries', priority: 1 }],
};

/** Merged confidence at which adaptive execution stops running further tiers. */
export const DEFAULT_SUFFICIENT_CONFIDENCE = 0.9;

export function stagesForIntent(intent: QueryType): PlanStage[] {
  return (PLANNING_RULES[intent] ?? PLANNING_RULES[QueryType.UNKNOWN]).map((rule) => ({
    kind: rule.kind,
    source: rule.source,
    placeholder: rule.placeholder,
    priority: rule.priority ?? EXECUTOR_PROFILES[rule.kind].priority,
    runIf: rule.runIf ?? 'always',
    profile: EXECUTOR_PROFILES[rule.kind],
  }));
}
