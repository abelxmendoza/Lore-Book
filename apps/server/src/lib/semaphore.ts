/**
 * Minimal async semaphore — bounds concurrent execution (no dependency).
 * Used to gate OpenAI calls so the ingestion detector fan-out can't burst past
 * the rate limit (the "over capacity" root cause).
 */
export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
  stats(): { active: number; queued: number; max: number };
}

export function createSemaphore(max: number): Semaphore {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) { active += 1; return Promise.resolve(); }
    return new Promise<void>((resolve) => waiters.push(() => { active += 1; resolve(); }));
  };
  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try { return await fn(); } finally { release(); }
    },
    stats: () => ({ active, queued: waiters.length, max: limit }),
  };
}
