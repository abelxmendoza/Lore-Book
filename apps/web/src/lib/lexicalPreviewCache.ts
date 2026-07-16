import { fetchLexicalPreview, type LexicalPreviewResponse } from '../api/lexicalPreview';
import { PreviewRateLimitGate } from './previewRateLimitGate';

const cache = new Map<string, Promise<LexicalPreviewResponse>>();
const gate = new PreviewRateLimitGate();

const EMPTY: LexicalPreviewResponse = {
  spans: [],
  inferredAssociations: [],
  ambiguities: [],
};

function cacheKey(text: string, threadId?: string): string {
  return `${threadId ?? ''}::${text}`;
}

/** Dedupe in-flight lexical preview requests (composer + entity indexer). */
export function fetchLexicalPreviewShared(
  text: string,
  threadId?: string
): Promise<LexicalPreviewResponse> {
  // Rate-limited: previews are cosmetic — skip quietly instead of hammering.
  if (gate.isCoolingDown()) return Promise.resolve(EMPTY);

  const key = cacheKey(text, threadId);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = fetchLexicalPreview(text, threadId)
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
export function clearLexicalPreviewSharedCache(): void {
  cache.clear();
  gate.reset();
}
