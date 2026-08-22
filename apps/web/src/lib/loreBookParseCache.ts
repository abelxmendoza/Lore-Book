import { fetchLoreBookParse, type LoreBookParseResponse } from '../api/loreBookParse';
import { composerIntelligenceMetrics } from './composerIntelligence';
import { PreviewRateLimitGate } from './previewRateLimitGate';

const resultCache = new Map<string, Promise<LoreBookParseResponse>>();
const gate = new PreviewRateLimitGate();

const EMPTY: LoreBookParseResponse = {
  operations: [],
  redirects: [],
  suppressed: [],
  warnings: [],
  lexicalSpanCount: 0,
};

function cacheKey(text: string, threadId?: string): string {
  return `${threadId ?? ''}::${text}`;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  );
}

let inflight: { key: string; controller: AbortController } | null = null;

/** Dedupe in-flight LoreBook parse requests (composer + entity indexer). */
export function fetchLoreBookParseShared(
  text: string,
  threadId?: string,
  signal?: AbortSignal
): Promise<LoreBookParseResponse> {
  // Rate-limited: parse preview is cosmetic — skip quietly instead of hammering.
  if (gate.isCoolingDown()) return Promise.resolve(EMPTY);

  const key = cacheKey(text, threadId);
  const existing = resultCache.get(key);
  if (existing) return existing;

  if (inflight && inflight.key !== key) {
    inflight.controller.abort();
    inflight = null;
  }

  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  inflight = { key, controller };

  const promise = fetchLoreBookParse(text, threadId, controller.signal)
    .catch((err) => {
      if (isAbortError(err)) {
        resultCache.delete(key);
        throw err;
      }
      if (gate.noteError(err)) return EMPTY;
      throw err;
    })
    .finally(() => {
      if (inflight?.key === key) inflight = null;
      window.setTimeout(() => resultCache.delete(key), 4000);
    });
  composerIntelligenceMetrics.noteCanonReconstruction();
  resultCache.set(key, promise);
  return promise;
}

/** Cancel the in-flight LoreBook parse so a new keystroke does not keep stale server work alive. */
export function abortLoreBookParseShared(): void {
  inflight?.controller.abort();
  if (inflight) resultCache.delete(inflight.key);
  inflight = null;
}

/** @internal test helper */
export function clearLoreBookParseSharedCache(): void {
  abortLoreBookParseShared();
  resultCache.clear();
  gate.reset();
}
