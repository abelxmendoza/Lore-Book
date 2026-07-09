/**
 * QueryPlanner — turns a classification into a typed, adaptive execution plan.
 *
 * Planning is pure and synchronous: no I/O, no user-text parsing. Planning
 * decisions live in the PLANNING_RULES table (PlanningRules.ts), not here —
 * adding a query capability means adding a QueryType, a rule row, and an
 * executor. This file only applies cross-cutting invariants.
 */

import {
  DEFAULT_SUFFICIENT_CONFIDENCE,
  EXECUTOR_PROFILES,
  stagesForIntent,
} from './PlanningRules';
import type {
  PlanStage,
  QueryClassification,
  QueryPlan,
  ResolvedQueryEntity,
} from './QueryTypes';

export function planQuery(
  classification: QueryClassification,
  opts: {
    hasConversationHistory?: boolean;
    resolvedEntities?: ResolvedQueryEntity[];
  } = {},
): QueryPlan {
  let stages: PlanStage[] = stagesForIntent(classification.intent);

  // Invariant (legacy recall precedence): with live history, thread recall is
  // always in play as the first tier, whatever the taxonomy says.
  if (opts.hasConversationHistory && !stages.some((s) => s.kind === 'thread')) {
    stages = [
      {
        kind: 'thread',
        source: 'conversation',
        priority: 0,
        runIf: 'always',
        profile: EXECUTOR_PROFILES.thread,
      },
      ...stages,
    ];
  }

  // Invariant (legacy router rule): foundation-primary intents must not fall
  // back to raw journal snippets.
  if (classification.foundationPrimary) {
    stages = stages.filter((s) => s.kind !== 'semantic');
  }

  const ordered = [...stages].sort((a, b) => a.priority - b.priority);

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    executors: ordered.map(({ kind, source, placeholder }) => ({ kind, source, placeholder })),
    stages: ordered,
    sufficientConfidence: DEFAULT_SUFFICIENT_CONFIDENCE,
    filters: {
      timeframe: classification.matchedDates[0] ? { raw: classification.matchedDates[0] } : undefined,
      entities: classification.matchedEntities.length ? classification.matchedEntities : undefined,
      locations: classification.matchedLocations.length ? classification.matchedLocations : undefined,
    },
    classification,
    resolvedEntities: opts.resolvedEntities,
  };
}
