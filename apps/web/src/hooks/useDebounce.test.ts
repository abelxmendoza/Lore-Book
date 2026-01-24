import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('updates after delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );
    expect(result.current).toBe('a');
    rerender({ value: 'b', delay: 500 });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('b');
  });

  it('cancels previous timeout when value changes rapidly', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );
    rerender({ value: 'b', delay: 500 });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'c', delay: 500 });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('c');
  });
});
