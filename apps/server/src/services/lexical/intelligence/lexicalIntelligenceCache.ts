import type { LexicalIntelligenceResult } from './lexicalIntelligenceTypes';

/** Simple LRU cache for ephemeral preview / debug intelligence runs. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export type IntelligenceCacheKeyInput = {
  text: string;
  userId?: string;
  includeAlternatives?: boolean;
  includeAnalyzerEntities?: boolean;
  analyzerMode?: 'lite' | 'full';
};

export function intelligenceCacheKey(input: IntelligenceCacheKeyInput): string {
  return [
    input.text,
    input.userId ?? '',
    input.includeAlternatives !== false ? '1' : '0',
    input.includeAnalyzerEntities !== false ? '1' : '0',
    input.analyzerMode ?? 'lite',
  ].join('\0');
}

const DEFAULT_CACHE = new LruCache<string, LexicalIntelligenceResult>(128);

export function getCachedIntelligence(key: string): LexicalIntelligenceResult | undefined {
  return DEFAULT_CACHE.get(key);
}

export function setCachedIntelligence(key: string, result: LexicalIntelligenceResult): void {
  DEFAULT_CACHE.set(key, result);
}

export function clearIntelligenceCache(): void {
  DEFAULT_CACHE.clear();
}

export function intelligenceCacheSize(): number {
  return DEFAULT_CACHE.size;
}
