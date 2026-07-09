/**
 * Query Engine type system — the canonical vocabulary for retrieval.
 *
 * Everything downstream of the planner consumes these types, never raw user
 * text. Regex routing still powers classification today, but it is an
 * implementation detail behind IntentClassifier — swapping it for an ML
 * classifier later must not change anything that imports from this file.
 */

/** Formal query taxonomy. Executors may be placeholders; the vocabulary is not. */
export enum QueryType {
  IDENTITY = 'IDENTITY',
  RELATIONSHIP = 'RELATIONSHIP',
  TIMELINE = 'TIMELINE',
  LOCATION = 'LOCATION',
  ORGANIZATION = 'ORGANIZATION',
  ATTRIBUTE = 'ATTRIBUTE',
  COMPARISON = 'COMPARISON',
  AGGREGATE = 'AGGREGATE',
  NARRATIVE = 'NARRATIVE',
  CAUSAL = 'CAUSAL',
  SEMANTIC = 'SEMANTIC',
  GRAPH = 'GRAPH',
  WORKING_MEMORY = 'WORKING_MEMORY',
  KNOWLEDGE_GAP = 'KNOWLEDGE_GAP',
  UNKNOWN = 'UNKNOWN',
}

/** Normalized time constraint every executor can consume. */
export type TimeWindow = {
  start?: string; // ISO
  end?: string; // ISO
  /** e.g. "before I joined Amazon", "after I met Renna" — resolved later. */
  relativeTo?: string;
  /** Raw temporal phrase as written by the user. */
  raw?: string;
};

export type QueryFilters = {
  timeframe?: TimeWindow;
  entities?: string[];
  locations?: string[];
};

/** Output of IntentClassifier — classification, never execution. */
export type QueryClassification = {
  intent: QueryType;
  /** The pre-engine intent string (recallIntentPatterns) that produced this. */
  legacyIntent: string | null;
  confidence: number;
  matchedEntities: string[];
  matchedDates: string[];
  matchedLocations: string[];
  /** Foundation intents must not fall back to raw journal snippets. */
  foundationPrimary: boolean;
};

/** Executor kinds the planner can schedule. */
export type ExecutorKind =
  | 'structured'
  | 'thread'
  | 'semantic'
  | 'working_memory'
  | 'crystallized'
  | 'graph'
  | 'timeline'
  | 'analytics';

export type PlannedExecutor = {
  kind: ExecutorKind;
  /** Backend hint, e.g. 'relationships', 'characters', 'journal_entries'. */
  source?: string;
  /** Placeholder executors are planned but expected to return empty results. */
  placeholder?: boolean;
};

/** Typed execution plan — the unit the rest of the system consumes. */
export type QueryPlan = {
  intent: QueryType;
  confidence: number;
  executors: PlannedExecutor[];
  filters: QueryFilters;
  classification: QueryClassification;
};

/** Where a result came from and how — groundwork for evidence visualization. */
export type ProvenanceRecord = {
  origin: 'foundation' | 'thread' | 'journal' | 'working_memory' | 'crystallized' | 'graph' | 'timeline' | 'analytics';
  /** Retrieval method, e.g. 'deterministic_router', 'semantic_search'. */
  method: string;
  table?: string;
  entityIds?: string[];
  journalIds?: string[];
  claimIds?: string[];
  confidence: number;
};

export type Citation = {
  kind: 'journal_entry' | 'entity' | 'claim' | 'thread_message' | 'event';
  id: string;
  label?: string;
  timestamp?: string;
};

export type QueryRecord = {
  id?: string;
  type: string;
  title?: string;
  content: string;
  score?: number;
  /** Raw payload for callers that need the underlying shape. */
  data?: unknown;
};

/** Standardized executor output. Downstream merges these, never custom objects. */
export type QueryResult = {
  source: ExecutorKind;
  confidence: number;
  provenance: ProvenanceRecord[];
  latencyMs: number;
  records: QueryRecord[];
  citations: Citation[];
  /**
   * The untranslated payload from the wrapped legacy service. Exists so the
   * current recall flow keeps byte-identical formatting during migration;
   * new callers should prefer `records`.
   */
  raw?: unknown;
  /** Non-fatal executor problems (an executor failing never fails the plan). */
  error?: string;
};

export type MergedQueryResponse = {
  records: QueryRecord[];
  citations: Citation[];
  provenance: ProvenanceRecord[];
  /** Weighted overall confidence across contributing executors. */
  confidence: number;
  contributingSources: ExecutorKind[];
};

/** Everything an executor may need. Executors must not re-parse user text. */
export type QueryContext = {
  userId: string;
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
  threadId?: string;
  plan: QueryPlan;
};

// ─── Graph interfaces (no graph database yet — traversal plugs in here) ──────

export type GraphNode = {
  id: string;
  type: 'character' | 'organization' | 'location' | 'event' | 'skill' | 'entity';
  name: string;
};

export type GraphEdge = {
  fromId: string;
  toId: string;
  type: string;
  category?: string;
  confidence?: number;
};

export type TraversalPlan = {
  startNode: Pick<GraphNode, 'name' | 'type'> | { id: string };
  /** e.g. ['knows', 'introduced_by'] — empty means any edge. */
  edgeTypes: string[];
  maxDepth: number;
  /** Stop when reaching a node matching this predicate description. */
  target?: Pick<GraphNode, 'name' | 'type'>;
};

export type TraversalResult = {
  paths: Array<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  visited: number;
};

/** Analytics interfaces (no statistics yet — aggregation plugs in here). */
export type AggregateSpec = {
  metric: 'mention_count' | 'visit_count' | 'sentiment_avg' | 'skill_usage' | 'custom';
  groupBy: 'character' | 'location' | 'organization' | 'skill' | 'month' | 'theme';
  timeframe?: TimeWindow;
  limit?: number;
};
