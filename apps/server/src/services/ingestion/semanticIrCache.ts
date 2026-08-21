/**
 * Reuse semantic extraction IR keyed by tenant + source + content hash + extractor version.
 * Edits change the content hash and miss. Not a global raw-text cache.
 */

import { createHash } from 'crypto';

import { SEMANTIC_IR_EXTRACTOR_VERSION } from './workerHighWaterMark';

export function hashIrContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function semanticIrKey(parts: {
  userId: string;
  sourceId: string;
  contentHash: string;
  extractorVersion?: string;
}): string {
  return [
    parts.userId,
    parts.sourceId,
    parts.contentHash,
    parts.extractorVersion ?? SEMANTIC_IR_EXTRACTOR_VERSION,
  ].join('|');
}

const cache = new Map<string, { value: unknown; storedAt: number }>();
const MAX = 400;
const TTL_MS = 30 * 60 * 1000;

export function getSemanticIr<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setSemanticIr(key: string, value: unknown): void {
  if (cache.size >= MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { value, storedAt: Date.now() });
}

export function invalidateSemanticIr(userId: string, sourceId: string): void {
  const prefix = `${userId}|${sourceId}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function resetSemanticIrCacheForTests(): void {
  cache.clear();
}
