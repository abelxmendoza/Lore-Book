import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

/**
 * Whole-app OpenAI cost attribution.
 *
 * The per-message meter (messageCostTracker) records usage in-request; this
 * service durably aggregates it across the whole app so the admin console can
 * answer "where is the money going and why" in USD. It buffers per-call deltas
 * in memory keyed by (day, operation, model) and flushes them to
 * `openai_cost_daily` on an interval / size threshold via an atomic increment
 * RPC, so we never do a DB write per LLM call.
 *
 * `operation` is the "where/why": e.g. `chat`, `ingestion`, `embedding`,
 * falling back to a coarse context label.
 */

type Bucket = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || !!process.env.VITEST;
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_AT_SIZE = 200;
const SEP = '|';

function bucketKey(day: string, operation: string, model: string): string {
  return [day, operation, model].join(SEP);
}

class CostAttributionService {
  private buffer = new Map<string, Bucket>();
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  /** Record one call's cost. Buffered; flushed in the background. */
  record(input: {
    operation: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    usd: number;
  }): void {
    const day = new Date().toISOString().slice(0, 10);
    const operation = input.operation || 'unknown';
    const model = input.model || 'unknown';
    const key = bucketKey(day, operation, model);

    const b = this.buffer.get(key) ?? { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
    b.calls += 1;
    b.inputTokens += input.inputTokens;
    b.outputTokens += input.outputTokens;
    b.usd += input.usd;
    this.buffer.set(key, b);

    if (IS_TEST_ENV) return; // deterministic: tests flush explicitly
    if (this.buffer.size >= FLUSH_AT_SIZE) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // Don't keep the process alive solely for a cost flush.
    this.timer.unref?.();
  }

  /** Drain the buffer to the DB. Safe to call concurrently (guards re-entry). */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.size === 0) return;
    this.flushing = true;
    const draining = this.buffer;
    this.buffer = new Map();

    try {
      for (const [key, b] of draining) {
        const [day, operation, model] = key.split(SEP);
        const { error } = await supabaseAdmin.rpc('record_openai_cost_daily', {
          p_day: day,
          p_operation: operation,
          p_model: model,
          p_calls: b.calls,
          p_input_tokens: b.inputTokens,
          p_output_tokens: b.outputTokens,
          p_usd: b.usd,
        });
        if (error) {
          // Re-buffer this bucket so the spend isn't silently dropped.
          const existing = this.buffer.get(key);
          if (existing) {
            existing.calls += b.calls;
            existing.inputTokens += b.inputTokens;
            existing.outputTokens += b.outputTokens;
            existing.usd += b.usd;
          } else {
            this.buffer.set(key, b);
          }
          logger.warn({ err: error, key }, 'costAttribution: flush failed, re-buffered');
        }
      }
    } catch (err) {
      logger.warn({ err }, 'costAttribution: flush error');
    } finally {
      this.flushing = false;
    }
  }

  /** Test helper: peek the in-memory buffer. */
  __peek(): Map<string, Bucket> {
    return this.buffer;
  }
}

export const costAttributionService = new CostAttributionService();

export type CostSummary = {
  rangeDays: number;
  since: string;
  totalUsd: number;
  totalCalls: number;
  byOperation: Array<{ operation: string; usd: number; calls: number; pctOfTotal: number }>;
  byModel: Array<{ model: string; usd: number; calls: number }>;
  byDay: Array<{ day: string; usd: number; calls: number }>;
};

/**
 * Aggregate `openai_cost_daily` for the admin console. Answers whole-app USD,
 * where (operation), what (model), and trend (day).
 */
export async function getCostSummary(rangeDays = 30): Promise<CostSummary> {
  const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('openai_cost_daily')
    .select('day, operation, model, calls, estimated_usd')
    .gte('day', since);

  const rows = error || !data ? [] : data;
  if (error) logger.warn({ err: error }, 'getCostSummary: read failed');

  let totalUsd = 0;
  let totalCalls = 0;
  const opMap = new Map<string, { usd: number; calls: number }>();
  const modelMap = new Map<string, { usd: number; calls: number }>();
  const dayMap = new Map<string, { usd: number; calls: number }>();

  for (const r of rows) {
    const usd = Number(r.estimated_usd) || 0;
    const calls = Number(r.calls) || 0;
    totalUsd += usd;
    totalCalls += calls;
    const op = opMap.get(r.operation) ?? { usd: 0, calls: 0 };
    op.usd += usd;
    op.calls += calls;
    opMap.set(r.operation, op);
    const md = modelMap.get(r.model) ?? { usd: 0, calls: 0 };
    md.usd += usd;
    md.calls += calls;
    modelMap.set(r.model, md);
    const dy = dayMap.get(r.day) ?? { usd: 0, calls: 0 };
    dy.usd += usd;
    dy.calls += calls;
    dayMap.set(r.day, dy);
  }

  const round = (n: number) => Math.round(n * 1e6) / 1e6;

  return {
    rangeDays,
    since,
    totalUsd: round(totalUsd),
    totalCalls,
    byOperation: [...opMap.entries()]
      .map(([operation, v]) => ({
        operation,
        usd: round(v.usd),
        calls: v.calls,
        pctOfTotal: totalUsd > 0 ? Math.round((v.usd / totalUsd) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.usd - a.usd),
    byModel: [...modelMap.entries()]
      .map(([model, v]) => ({ model, usd: round(v.usd), calls: v.calls }))
      .sort((a, b) => b.usd - a.usd),
    byDay: [...dayMap.entries()]
      .map(([day, v]) => ({ day, usd: round(v.usd), calls: v.calls }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}
