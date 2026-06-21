import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisiblePolling } from './useVisiblePolling';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useVisiblePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires immediately by default, then on each interval while visible', () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePolling(cb, 1000));
    expect(cb).toHaveBeenCalledTimes(1); // immediate
    vi.advanceTimersByTime(3000);
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('does not fire immediately when immediate=false', () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePolling(cb, 1000, { immediate: false }));
    expect(cb).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips interval ticks while the tab is hidden', () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePolling(cb, 1000, { immediate: false }));
    setVisibility('hidden');
    cb.mockClear();
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(0); // no egress while hidden
  });

  it('fires once when the tab becomes visible again', () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePolling(cb, 1000, { immediate: false }));
    setVisibility('hidden');
    cb.mockClear();
    setVisibility('visible');
    expect(cb).toHaveBeenCalledTimes(1); // refresh-on-return
  });

  it('does nothing when disabled', () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePolling(cb, 1000, { enabled: false }));
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(0);
  });

  it('clears the interval on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useVisiblePolling(cb, 1000, { immediate: false }));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(0);
  });
});
