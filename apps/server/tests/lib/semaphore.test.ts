import { describe, expect, it } from 'vitest';

import { createSemaphore } from '../../src/lib/semaphore';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createSemaphore — bounds concurrency (the 429 fix)', () => {
  it('never exceeds the configured max concurrent', async () => {
    const sem = createSemaphore(3);
    let inFlight = 0;
    let peak = 0;
    const task = async () => sem.run(async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await sleep(10);
      inFlight -= 1;
    });
    await Promise.all(Array.from({ length: 20 }, task));
    expect(peak).toBeLessThanOrEqual(3);
    expect(inFlight).toBe(0);
  });

  it('runs all tasks (none dropped) and returns their values', async () => {
    const sem = createSemaphore(2);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => sem.run(async () => { await sleep(1); return n * 2; })));
    expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it('releases the slot even when the task throws', async () => {
    const sem = createSemaphore(1);
    await expect(sem.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    // If the slot leaked, this second task would hang forever.
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
    expect(sem.stats().active).toBe(0);
  });

  it('treats max < 1 as 1', () => {
    expect(createSemaphore(0).stats().max).toBe(1);
  });
});
