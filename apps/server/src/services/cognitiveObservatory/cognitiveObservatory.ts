import { createHash } from 'node:crypto';

import type {
  CognitiveObservatoryTrace,
  CognitiveStageStatus,
  CognitiveStageTrace,
} from './cognitiveObservatoryTypes';

const MAX_TRACES = 1_000;
const TRACE_TTL_MS = 30 * 60_000;

function traceId(userId: string, sourceId: string): string {
  return `cogtrace_${createHash('sha256').update(`${userId}:${sourceId}`).digest('hex').slice(0, 20)}`;
}

function combineStatus(stages: CognitiveStageTrace[]): CognitiveStageStatus {
  if (stages.some((stage) => stage.status === 'FAIL')) return 'FAIL';
  if (stages.some((stage) => stage.status === 'WARN')) return 'WARN';
  if (stages.some((stage) => stage.status === 'PASS')) return 'PASS';
  return 'SKIPPED';
}

export class CognitiveObservatory {
  private readonly traces = new Map<string, CognitiveObservatoryTrace>();
  private readonly expiry = new Map<string, number>();

  recordStage(input: {
    userId: string;
    sourceId: string;
    trace: CognitiveStageTrace;
  }): CognitiveObservatoryTrace {
    this.evictExpired();
    const key = traceId(input.userId, input.sourceId);
    const existing = this.traces.get(key) ?? {
      id: key,
      version: 'cognitive-observatory-v1' as const,
      userId: input.userId,
      sourceId: input.sourceId,
      startedAt: input.trace.startedAt,
      completedAt: null,
      status: 'SKIPPED' as const,
      stages: [],
      totals: { durationMs: 0, created: 0, reused: 0, updated: 0, discarded: 0 },
      projectionCoverage: {
        assertions: 'MEASURED' as const,
        canonical_timeline: 'MEASURED' as const,
        project_projection: 'MEASURED' as const,
        current_focus: 'MEASURED' as const,
        narrative_ir: 'NOT_WIRED' as const,
        identity_snapshot: 'NOT_WIRED' as const,
        context_plan: 'NOT_WIRED' as const,
        recall_composer: 'NOT_WIRED' as const,
      },
      invariants: { containsRawMessageText: false as const, tenantScoped: true as const },
    };
    const stages = [...existing.stages.filter((stage) => stage.stage !== input.trace.stage), input.trace];
    const next: CognitiveObservatoryTrace = {
      ...existing,
      stages,
      status: combineStatus(stages),
      totals: {
        durationMs: stages.reduce((sum, stage) => sum + stage.durationMs, 0),
        created: stages.reduce((sum, stage) => sum + (stage.counts.created ?? 0), 0),
        reused: stages.reduce((sum, stage) => sum + (stage.counts.reused ?? 0), 0),
        updated: stages.reduce((sum, stage) => sum + (stage.counts.updated ?? 0), 0),
        discarded: stages.reduce((sum, stage) => sum + (stage.counts.discarded ?? 0), 0),
      },
    };
    this.traces.set(key, next);
    this.expiry.set(key, Date.now() + TRACE_TTL_MS);
    while (this.traces.size > MAX_TRACES) {
      const oldest = this.traces.keys().next().value;
      if (!oldest) break;
      this.traces.delete(oldest);
      this.expiry.delete(oldest);
    }
    return next;
  }

  complete(userId: string, sourceId: string, completedAt = new Date().toISOString()): CognitiveObservatoryTrace | null {
    const key = traceId(userId, sourceId);
    const trace = this.traces.get(key);
    if (!trace) return null;
    const completed = { ...trace, completedAt };
    this.traces.set(key, completed);
    return completed;
  }

  get(userId: string, sourceId: string): CognitiveObservatoryTrace | null {
    this.evictExpired();
    const trace = this.traces.get(traceId(userId, sourceId));
    return trace?.userId === userId ? trace : null;
  }

  clear(): void {
    this.traces.clear();
    this.expiry.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.expiry) {
      if (expiresAt > now) continue;
      this.traces.delete(key);
      this.expiry.delete(key);
    }
  }
}

export const cognitiveObservatory = new CognitiveObservatory();
