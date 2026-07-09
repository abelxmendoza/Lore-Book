/**
 * Execution metrics — lightweight, optional planner statistics.
 *
 * Pure in-memory counters (no I/O, no persistence): the raw material for
 * planner learning later — which plans produce the highest-confidence
 * answers, how often semantic fallback actually fires, etc.
 */

import type { ExecutorKind } from './QueryTypes';

type Snapshot = {
  totalQueries: number;
  avgLatencyMs: number;
  avgExecutorCount: number;
  avgConfidence: number;
  executorUsage: Record<string, number>;
  /** Share of queries where each executor actually ran (0..1). */
  executorUsageRate: Record<string, number>;
  cacheHitRate: number;
  earlyStopRate: number;
  fallbackRate: number;
  knowledgeGapRate: number;
  intentCounts: Record<string, number>;
};

class ExecutionMetrics {
  private enabled = process.env.QUERY_METRICS_DISABLED !== 'true';
  private totalQueries = 0;
  private totalLatency = 0;
  private totalExecutors = 0;
  private totalConfidence = 0;
  private cacheChecks = 0;
  private cacheHits = 0;
  private earlyStops = 0;
  private fallbacks = 0;
  private knowledgeGaps = 0;
  private executorUsage = new Map<ExecutorKind, number>();
  private intentCounts = new Map<string, number>();

  recordQuery(input: {
    intent: string;
    latencyMs: number;
    executed: Array<{ kind: ExecutorKind; cacheHit?: boolean }>;
    finalConfidence: number;
    earlyStopped: boolean;
    usedFallback: boolean;
    knowledgeGap: boolean;
  }): void {
    if (!this.enabled) return;
    this.totalQueries += 1;
    this.totalLatency += input.latencyMs;
    this.totalExecutors += input.executed.length;
    this.totalConfidence += input.finalConfidence;
    if (input.earlyStopped) this.earlyStops += 1;
    if (input.usedFallback) this.fallbacks += 1;
    if (input.knowledgeGap) this.knowledgeGaps += 1;
    this.intentCounts.set(input.intent, (this.intentCounts.get(input.intent) ?? 0) + 1);
    for (const executed of input.executed) {
      this.executorUsage.set(executed.kind, (this.executorUsage.get(executed.kind) ?? 0) + 1);
      if (executed.cacheHit !== undefined) {
        this.cacheChecks += 1;
        if (executed.cacheHit) this.cacheHits += 1;
      }
    }
  }

  snapshot(): Snapshot {
    const n = Math.max(this.totalQueries, 1);
    return {
      totalQueries: this.totalQueries,
      avgLatencyMs: this.totalLatency / n,
      avgExecutorCount: this.totalExecutors / n,
      avgConfidence: this.totalConfidence / n,
      executorUsage: Object.fromEntries(this.executorUsage),
      executorUsageRate: Object.fromEntries(
        [...this.executorUsage].map(([k, v]) => [k, v / n]),
      ),
      cacheHitRate: this.cacheChecks ? this.cacheHits / this.cacheChecks : 0,
      earlyStopRate: this.earlyStops / n,
      fallbackRate: this.fallbacks / n,
      knowledgeGapRate: this.knowledgeGaps / n,
      intentCounts: Object.fromEntries(this.intentCounts),
    };
  }

  reset(): void {
    this.totalQueries = 0;
    this.totalLatency = 0;
    this.totalExecutors = 0;
    this.totalConfidence = 0;
    this.cacheChecks = 0;
    this.cacheHits = 0;
    this.earlyStops = 0;
    this.fallbacks = 0;
    this.knowledgeGaps = 0;
    this.executorUsage.clear();
    this.intentCounts.clear();
  }
}

export const executionMetrics = new ExecutionMetrics();
