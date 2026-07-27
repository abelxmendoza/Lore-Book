import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withIdleTimeout } from './useChatStream';

describe('withIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the inner value when it settles before the deadline', async () => {
    const inner = Promise.resolve('chunk');
    const controller = new AbortController();
    const result = withIdleTimeout(inner, 1000, controller, 'timed out');

    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe('chunk');
    expect(controller.signal.aborted).toBe(false);
  });

  it('rejects with the timeout message and aborts the controller when nothing arrives in time', async () => {
    const inner = new Promise<string>(() => {}); // never settles — simulates a dead connection
    const controller = new AbortController();
    const result = withIdleTimeout(inner, 1000, controller, 'The assistant stream went quiet before responding. Retry this reply.');
    // Prevent an unhandled-rejection warning for the still-pending inner promise.
    inner.catch(() => {});

    const assertion = expect(result).rejects.toThrow(
      'The assistant stream went quiet before responding. Retry this reply.',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(controller.signal.aborted).toBe(true);
  });

  it('propagates the inner rejection unchanged when it fails before the deadline', async () => {
    const inner = Promise.reject(new Error('network down'));
    const controller = new AbortController();
    const result = withIdleTimeout(inner, 1000, controller, 'timed out');

    await expect(result).rejects.toThrow('network down');
    expect(controller.signal.aborted).toBe(false);
  });
});
