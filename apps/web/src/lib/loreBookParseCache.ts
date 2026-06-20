import { fetchLoreBookParse, type LoreBookParseResponse } from '../api/loreBookParse';

const cache = new Map<string, Promise<LoreBookParseResponse>>();

function cacheKey(text: string, threadId?: string): string {
  return `${threadId ?? ''}::${text}`;
}

/** Dedupe in-flight LoreBook parse requests (composer + entity indexer). */
export function fetchLoreBookParseShared(
  text: string,
  threadId?: string
): Promise<LoreBookParseResponse> {
  const key = cacheKey(text, threadId);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = fetchLoreBookParse(text, threadId).finally(() => {
    window.setTimeout(() => cache.delete(key), 4000);
  });
  cache.set(key, promise);
  return promise;
}

/** @internal test helper */
export function clearLoreBookParseSharedCache(): void {
  cache.clear();
}
