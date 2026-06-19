/**
 * Stage latency timer.
 *
 * Companion to IngestionCostMeter (which counts LLM calls): this measures *where
 * wall-clock time goes* across a multi-stage operation — chat critical path,
 * ingestion, RAG build, etc. Answers "is the bottleneck DB, retrieval, OpenAI,
 * or background extraction?" without a tracing dependency.
 *
 * Usage:
 *   const t = new StageTimer('chat.persist', { userId });
 *   await saveMessage();        t.mark('save');
 *   await interpretation();     t.mark('interpretation');
 *   t.flush();   // logs `stage.timing` with per-stage + total ms
 *
 * `mark(name)` records elapsed since the previous mark (or since construction).
 * Cheap (one Date.now() + push per mark); safe to leave in hot paths.
 */
import { logger } from '../logger';

export interface StageSplit {
  stage: string;
  ms: number;
}

export class StageTimer {
  private readonly startedAt: number;
  private last: number;
  private readonly splits: StageSplit[] = [];

  constructor(
    private readonly operation: string,
    private readonly context: Record<string, unknown> = {},
  ) {
    this.startedAt = Date.now();
    this.last = this.startedAt;
  }

  /** Record elapsed since the previous mark under `stage`. */
  mark(stage: string): void {
    const now = Date.now();
    this.splits.push({ stage, ms: now - this.last });
    this.last = now;
  }

  /** Total elapsed since construction. */
  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  summary() {
    const totalMs = this.totalMs();
    // Slowest stage is the first place to look — surface it explicitly.
    const slowest = this.splits.reduce<StageSplit | null>(
      (max, s) => (!max || s.ms > max.ms ? s : max),
      null,
    );
    return {
      operation: this.operation,
      totalMs,
      slowestStage: slowest?.stage,
      slowestMs: slowest?.ms,
      stages: this.splits,
    };
  }

  /** Emit the `stage.timing` log line. Call once when the operation completes. */
  flush(extra: Record<string, unknown> = {}): ReturnType<StageTimer['summary']> {
    const summary = this.summary();
    logger.info({ ...this.context, ...extra, ...summary }, 'stage.timing');
    return summary;
  }
}
