import { fetchLexicalPreview, type LexicalPreviewResponse } from '../api/lexicalPreview';

const cache = new Map<string, Promise<LexicalPreviewResponse>>();

function cacheKey(text: string, threadId?: string): string {
  return `${threadId ?? ''}::${text}`;
}

/** Dedupe in-flight lexical preview requests (composer + entity indexer). */
export function fetchLexicalPreviewShared(
  text: string,
  threadId?: string
): Promise<LexicalPreviewResponse> {
  const key = cacheKey(text, threadId);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = fetchLexicalPreview(text, threadId).finally(() => {
    window.setTimeout(() => cache.delete(key), 4000);
  });
  cache.set(key, promise);
  return promise;
}

/** @internal test helper */
export function clearLexicalPreviewSharedCache(): void {
  cache.clear();
}
