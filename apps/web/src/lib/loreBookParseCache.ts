import { fetchLoreBookParse, type LoreBookParseResponse } from '../api/loreBookParse';
import { PreviewRateLimitGate } from './previewRateLimitGate';

const cache = new Map<string, Promise<LoreBookParseResponse>>();
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

/** Dedupe in-flight LoreBook parse requests (composer + entity indexer). */
export function fetchLoreBookParseShared(
  text: string,
  threadId?: string
): Promise<LoreBookParseResponse> {
  // Rate-limited: parse preview is cosmetic — skip quietly instead of hammering.
  if (gate.isCoolingDown()) return Promise.resolve(EMPTY);

  const key = cacheKey(text, threadId);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = fetchLoreBookParse(text, threadId)
    .catch((err) => {
      if (gate.noteError(err)) return EMPTY;
      throw err;
    })
    .finally(() => {
      window.setTimeout(() => cache.delete(key), 4000);
    });
  cache.set(key, promise);
  return promise;
}

/** @internal test helper */
export function clearLoreBookParseSharedCache(): void {
  cache.clear();
  gate.reset();
}
