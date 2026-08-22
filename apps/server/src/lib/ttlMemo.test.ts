import { describe, expect, it, vi } from 'vitest';

import { createTtlMemo } from './ttlMemo';

describe('createTtlMemo', () => {
  it('loads once and reuses the value within the TTL', async () => {
    const memo = createTtlMemo<number>(10_000);
    const load = vi.fn(async () => 7);

    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(7);
    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent loads for the same key', async () => {
    const memo = createTtlMemo<string>(10_000);
    let resolveLoad: (value: string) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = memo.getOrLoad('user-a', load);
    const second = memo.getOrLoad('user-a', load);
    resolveLoad('ready');

    await expect(Promise.all([first, second])).resolves.toEqual(['ready', 'ready']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads after invalidate and after the TTL expires', async () => {
    vi.useFakeTimers();
    const memo = createTtlMemo<number>(1_000);
    const load = vi.fn(async () => load.mock.calls.length);

    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(1);
    memo.invalidate('user-a');
    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(2);

    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(2);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(memo.getOrLoad('user-a', load)).resolves.toBe(3);
    vi.useRealTimers();
  });
});
