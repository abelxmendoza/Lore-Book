/**
 * Bounded work per background execution. Chat stays ahead of catch-up.
 * Remaining backlog resumes from the high-water mark on the next run.
 */

export type DeltaJobBudget = {
  maxRows: number;
  maxLlmCalls: number;
  maxEmbeddingCalls: number;
  maxProcessingMs: number;
};

export const EVENT_RECOVERY_DELTA_BUDGET: DeltaJobBudget = {
  maxRows: 100,
  maxLlmCalls: 0,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 8_000,
};

export const EVENT_RECOVERY_SWEEP_BUDGET: DeltaJobBudget = {
  maxRows: 800,
  maxLlmCalls: 0,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 30_000,
};

export const EVENT_ASSEMBLY_DELTA_BUDGET: DeltaJobBudget = {
  maxRows: 80,
  maxLlmCalls: 3,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 8_000,
};

export const EVENT_ASSEMBLY_RECOVERY_BUDGET: DeltaJobBudget = {
  maxRows: 200,
  maxLlmCalls: 8,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 20_000,
};

/** 24h lookback so a new unit can join an in-progress experience. */
export const EVENT_ASSEMBLY_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** ~5 prior messages so a regex can still span a turn boundary. */
export const EVENT_RECOVERY_OVERLAP_MS = 10 * 60 * 1000;

/**
 * Relationship delta overlap: a co-mention can straddle two messages a few
 * minutes apart. Evidence is still deduped by source id so overlap cannot
 * double-count interactions.
 */
export const RELATIONSHIP_DELTA_OVERLAP_MS = 10 * 60 * 1000;

export const RELATIONSHIP_DELTA_BUDGET: DeltaJobBudget = {
  maxRows: 80,
  maxLlmCalls: 0,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 8_000,
};

export const RELATIONSHIP_RECOVERY_BUDGET: DeltaJobBudget = {
  maxRows: 500,
  maxLlmCalls: 0,
  maxEmbeddingCalls: 0,
  maxProcessingMs: 20_000,
};

export class JobBudgetClock {
  readonly startedAt = Date.now();
  llmCalls = 0;
  embeddingCalls = 0;
  rowsTaken = 0;

  constructor(private readonly budget: DeltaJobBudget) {}

  get remainingMs(): number {
    return this.budget.maxProcessingMs - (Date.now() - this.startedAt);
  }

  canTakeRow(): boolean {
    if (this.rowsTaken >= this.budget.maxRows) return false;
    if (this.remainingMs <= 0) return false;
    return true;
  }

  takeRow(): boolean {
    if (!this.canTakeRow()) return false;
    this.rowsTaken += 1;
    return true;
  }

  canCallLlm(): boolean {
    return this.llmCalls < this.budget.maxLlmCalls && this.remainingMs > 0;
  }

  recordLlm(): void {
    this.llmCalls += 1;
  }

  exhausted(): boolean {
    return !this.canTakeRow() || this.remainingMs <= 0;
  }
}
