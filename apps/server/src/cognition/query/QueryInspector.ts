/**
 * Query Inspector — internal developer tooling for retrieval debugging.
 *
 * Records a full trace of every engine run: classification, entity
 * resolution, the plan, which executors ran or were skipped (and why),
 * per-executor latency/cache/records, merge output, and final confidence.
 *
 * In-memory ring buffer only. NOT exposed publicly — read it from code or a
 * debugger via getRecentTraces(); future dev-console UI plugs in here.
 */

import type {
  ExecutorKind,
  MergedQueryResponse,
  QueryClassification,
  QueryPlan,
  QueryResult,
  ResolvedQueryEntity,
} from './QueryTypes';

export type ExecutorTrace = {
  kind: ExecutorKind;
  executed: boolean;
  skipReason?: string;
  latencyMs?: number;
  cacheHit?: boolean;
  recordCount?: number;
  confidence?: number;
  error?: string;
  tier?: number;
};

export type QueryTrace = {
  at: string;
  userId: string;
  query: string;
  intent: string;
  intentConfidence: number;
  resolvedEntities: ResolvedQueryEntity[];
  plan: {
    stages: Array<{ kind: ExecutorKind; priority: number; runIf: string; placeholder?: boolean }>;
    sufficientConfidence: number;
  };
  executors: ExecutorTrace[];
  totalLatencyMs: number;
  mergedRecordCount: number;
  finalConfidence: number;
  confidenceBreakdown: MergedQueryResponse['confidenceBreakdown'];
  earlyStopped: boolean;
};

const MAX_TRACES = 100;

class QueryInspector {
  private traces: QueryTrace[] = [];
  private enabled = process.env.QUERY_INSPECTOR_DISABLED !== 'true';

  record(input: {
    userId: string;
    query: string;
    classification: QueryClassification;
    plan: QueryPlan;
    resolvedEntities: ResolvedQueryEntity[];
    results: QueryResult[];
    merged: MergedQueryResponse;
    totalLatencyMs: number;
    earlyStopped: boolean;
    tiers: Map<ExecutorKind, number>;
  }): void {
    if (!this.enabled) return;

    const trace: QueryTrace = {
      at: new Date().toISOString(),
      userId: input.userId,
      query: input.query,
      intent: input.classification.intent,
      intentConfidence: input.classification.confidence,
      resolvedEntities: input.resolvedEntities,
      plan: {
        stages: input.plan.stages.map((s) => ({
          kind: s.kind,
          priority: s.priority,
          runIf: s.runIf,
          placeholder: s.placeholder,
        })),
        sufficientConfidence: input.plan.sufficientConfidence,
      },
      executors: input.results.map((r) => ({
        kind: r.source,
        executed: !r.skipped,
        skipReason: r.skipReason,
        latencyMs: r.skipped ? undefined : r.latencyMs,
        cacheHit: r.cacheHit,
        recordCount: r.skipped ? undefined : r.records.length,
        confidence: r.skipped ? undefined : r.confidence,
        error: r.error,
        tier: input.tiers.get(r.source),
      })),
      totalLatencyMs: input.totalLatencyMs,
      mergedRecordCount: input.merged.records.length,
      finalConfidence: input.merged.confidence,
      confidenceBreakdown: input.merged.confidenceBreakdown,
      earlyStopped: input.earlyStopped,
    };

    this.traces.push(trace);
    if (this.traces.length > MAX_TRACES) this.traces.shift();
  }

  getRecentTraces(limit = 20): QueryTrace[] {
    return this.traces.slice(-limit);
  }

  getLastTrace(): QueryTrace | undefined {
    return this.traces[this.traces.length - 1];
  }

  clear(): void {
    this.traces = [];
  }
}

export const queryInspector = new QueryInspector();
