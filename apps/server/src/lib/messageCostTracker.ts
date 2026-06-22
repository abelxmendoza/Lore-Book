import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../logger';
import { estimateUsdFromTokens } from './openaiCost';

/**
 * Per-message cost/usage accumulator (Launch-Readiness Step 1: MEASURE).
 *
 * The launch audit could only *estimate* "~10–18 model/embedding calls per
 * message" because nothing counted them on the live path. This is that counter.
 * It uses AsyncLocalStorage so a single `begin()` at the route handler captures
 * every LLM completion (via openaiBudgetService.recordOpenAiTokenUsage) and every
 * embedding (via embeddingService) that runs while assembling and streaming one
 * chat response — the whole synchronous "decorator fan-out" plus the answer.
 *
 * Allocation-cheap and a no-op outside an active context, so non-chat callers and
 * unit tests are unaffected. Background ingestion is metered separately by
 * ingestionCostMeter (different async context after the in-memory queue defers).
 */

export type ModelBreakdown = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

export type MessageCostAccumulator = {
  label: string;
  userId?: string;
  messageId?: string;
  /** Finer "where" within the message (e.g. chat.answer, chat.continuity). */
  currentOperation?: string;
  llmCalls: number;
  embeddingCalls: number;
  embeddingCacheHits: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  byModel: Record<string, ModelBreakdown>;
  startedAt: number;
};

export type MessageCostSummary = Omit<MessageCostAccumulator, 'startedAt'> & {
  durationMs: number;
};

const storage = new AsyncLocalStorage<MessageCostAccumulator>();

function newAccumulator(meta: { label: string; userId?: string; messageId?: string }): MessageCostAccumulator {
  return {
    label: meta.label,
    userId: meta.userId,
    messageId: meta.messageId,
    llmCalls: 0,
    embeddingCalls: 0,
    embeddingCacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    byModel: {},
    startedAt: Date.now(),
  };
}

/**
 * Begin accounting for the current async context. Uses enterWith so callers in a
 * big request handler (e.g. the SSE chat route) don't have to wrap their whole
 * body in a callback. The context ends naturally with the async operation.
 */
export function beginMessageCost(meta: { label: string; userId?: string; messageId?: string }): void {
  storage.enterWith(newAccumulator(meta));
}

/** For tests / explicit scoping: run fn within a fresh accounting context. */
export function runWithMessageCost<T>(
  meta: { label: string; userId?: string; messageId?: string },
  fn: () => T,
): T {
  return storage.run(newAccumulator(meta), fn);
}

export function getMessageCost(): MessageCostAccumulator | undefined {
  return storage.getStore();
}

/**
 * The "where/why" label for cost attribution: the current operation if one is
 * active, else the context label, else 'unknown' (still counted toward whole-app
 * spend). Used by the cost-attribution sink at the OpenAI choke points.
 */
export function getCurrentCostOperation(): string {
  const acc = storage.getStore();
  return acc?.currentOperation ?? acc?.label ?? 'unknown';
}

/** Scope a block to a finer operation label for attribution. Sync or async. */
export function withCostOperation<T>(operation: string, fn: () => T): T {
  const acc = storage.getStore();
  if (!acc) return fn();
  const previous = acc.currentOperation;
  acc.currentOperation = operation;
  const restore = () => {
    acc.currentOperation = previous;
  };
  try {
    const out = fn();
    if (out && typeof (out as { then?: unknown }).then === 'function') {
      return (out as unknown as Promise<unknown>).finally(restore) as unknown as T;
    }
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

/** Record one chat/completion call's token usage. No-op outside a context. */
export function recordLlmUsage(model: string, inputTokens: number, outputTokens: number): void {
  const acc = storage.getStore();
  if (!acc) return;
  const usd = estimateUsdFromTokens(model, inputTokens, outputTokens);
  acc.llmCalls += 1;
  acc.inputTokens += inputTokens;
  acc.outputTokens += outputTokens;
  acc.usd += usd;
  const m = (acc.byModel[model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  m.calls += 1;
  m.inputTokens += inputTokens;
  m.outputTokens += outputTokens;
  m.usd += usd;
}

/** Record one embedding lookup. cacheHit=true means no API call was made. */
export function recordEmbeddingCall(opts: { cacheHit: boolean; model?: string; tokens?: number }): void {
  const acc = storage.getStore();
  if (!acc) return;
  if (opts.cacheHit) {
    acc.embeddingCacheHits += 1;
    return;
  }
  acc.embeddingCalls += 1;
  if (opts.tokens && opts.model) {
    const usd = estimateUsdFromTokens(opts.model, opts.tokens, 0);
    acc.usd += usd;
    const m = (acc.byModel[opts.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
    m.calls += 1;
    m.inputTokens += opts.tokens;
    m.usd += usd;
  }
}

export function summarizeMessageCost(): MessageCostSummary | undefined {
  const acc = storage.getStore();
  if (!acc) return undefined;
  const { startedAt, ...rest } = acc;
  return { ...rest, durationMs: Date.now() - startedAt };
}

/** Emit one `message.cost` log line for the current context. Safe to call once. */
export function flushMessageCost(): MessageCostSummary | undefined {
  const summary = summarizeMessageCost();
  if (!summary) return undefined;
  logger.info({ ...summary }, 'message.cost');
  return summary;
}
