import type { LoreReadinessSummary } from './types';

type CacheEntry = {
  summary: LoreReadinessSummary;
  atomCount: number;
  updatedAt: number;
};

class ReadinessCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 120_000;

  get(userId: string, atomCount: number): LoreReadinessSummary | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.cache.delete(userId);
      return null;
    }
    if (entry.atomCount !== atomCount) return null;
    return entry.summary;
  }

  set(userId: string, atomCount: number, summary: LoreReadinessSummary): void {
    this.cache.set(userId, { summary, atomCount, updatedAt: Date.now() });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

export const readinessCache = new ReadinessCache();
