/**
 * QueryPlanner — turns a classification into a typed execution plan.
 *
 * Planning is pure and synchronous: no I/O, no user-text parsing. Adding a
 * new query capability means (1) adding a QueryType, (2) mapping it to
 * executors here, (3) implementing/enabling the executor. Nothing else.
 */

import {
  QueryType,
  type PlannedExecutor,
  type QueryClassification,
  type QueryPlan,
} from './QueryTypes';

/** Executor lineup per query type. Placeholders are planned deliberately so
 *  the plan shape is stable when the real executor lands. */
const EXECUTORS_BY_TYPE: Record<QueryType, PlannedExecutor[]> = {
  [QueryType.IDENTITY]: [
    { kind: 'structured', source: 'characters' },
    { kind: 'crystallized', source: 'omega_claims' },
  ],
  [QueryType.RELATIONSHIP]: [
    { kind: 'structured', source: 'relationships' },
    { kind: 'graph', placeholder: true },
  ],
  [QueryType.TIMELINE]: [
    { kind: 'structured', source: 'resolved_events' },
    { kind: 'timeline', placeholder: true },
    { kind: 'semantic', source: 'journal_entries' },
  ],
  [QueryType.LOCATION]: [{ kind: 'structured', source: 'locations' }],
  [QueryType.ORGANIZATION]: [{ kind: 'structured', source: 'organizations' }],
  [QueryType.ATTRIBUTE]: [
    { kind: 'structured', source: 'characters' },
    { kind: 'crystallized', source: 'omega_claims' },
  ],
  [QueryType.COMPARISON]: [
    { kind: 'structured', source: 'characters' },
    { kind: 'semantic', source: 'journal_entries' },
    { kind: 'analytics', placeholder: true },
  ],
  [QueryType.AGGREGATE]: [
    { kind: 'structured', source: 'characters' },
    { kind: 'analytics', placeholder: true },
  ],
  [QueryType.NARRATIVE]: [
    { kind: 'structured', source: 'characters' },
    { kind: 'semantic', source: 'journal_entries' },
    { kind: 'timeline', placeholder: true },
  ],
  [QueryType.CAUSAL]: [{ kind: 'semantic', source: 'journal_entries' }],
  [QueryType.SEMANTIC]: [{ kind: 'semantic', source: 'journal_entries' }],
  [QueryType.GRAPH]: [
    { kind: 'structured', source: 'relationships' },
    { kind: 'graph', placeholder: true },
  ],
  [QueryType.WORKING_MEMORY]: [
    { kind: 'thread', source: 'conversation' },
    { kind: 'working_memory' },
  ],
  [QueryType.KNOWLEDGE_GAP]: [{ kind: 'structured', source: 'characters' }],
  [QueryType.UNKNOWN]: [{ kind: 'semantic', source: 'journal_entries' }],
};

export function planQuery(
  classification: QueryClassification,
  opts: { hasConversationHistory?: boolean } = {},
): QueryPlan {
  const executors: PlannedExecutor[] = [...(EXECUTORS_BY_TYPE[classification.intent] ?? [])];

  // Preserve today's recall precedence: with live history, thread recall is
  // always in play as the first tier, whatever the taxonomy says.
  if (opts.hasConversationHistory && !executors.some((e) => e.kind === 'thread')) {
    executors.unshift({ kind: 'thread', source: 'conversation' });
  }

  // Foundation-primary intents must not fall back to raw journal snippets —
  // same rule the legacy router enforces.
  const filtered = classification.foundationPrimary
    ? executors.filter((e) => e.kind !== 'semantic')
    : executors;

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    executors: filtered,
    filters: {
      timeframe: classification.matchedDates[0] ? { raw: classification.matchedDates[0] } : undefined,
      entities: classification.matchedEntities.length ? classification.matchedEntities : undefined,
      locations: classification.matchedLocations.length ? classification.matchedLocations : undefined,
    },
    classification,
  };
}
