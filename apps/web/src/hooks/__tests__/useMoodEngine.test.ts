import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMoodEngine } from '../useMoodEngine';
import { fetchJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('useMoodEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with neutral mood', () => {
    const { result } = renderHook(() => useMoodEngine());

    expect(result.current.mood.score).toBe(0);
    expect(result.current.mood.label).toBe('Neutral');
    expect(result.current.loading).toBe(false);
    expect(result.current.intensity).toBe(0);
  });

  it('should call API and update mood on evaluate', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ mood: 3 });

    const { result } = renderHook(() => useMoodEngine());

    await act(async () => {
      await result.current.evaluate('I feel great today!');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/moods/score', {
      method: 'POST',
      body: JSON.stringify({ text: 'I feel great today!' }),
    });

    expect(result.current.mood.score).toBe(3);
  });

  it('should use fallback heuristic when API fails', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useMoodEngine());

    await act(async () => {
      await result.current.evaluate('I feel calm and grateful');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should use local heuristic (positive words: calm, grateful = +2)
    expect(result.current.mood.score).toBeGreaterThan(0);
    expect(result.current.mood.label).toBe('Reactive');
  });

  it('should reset to neutral when evaluating empty text', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ mood: -2 });
    const { result } = renderHook(() => useMoodEngine());

    // Set a mood first
    vi.mocked(fetchJson).mockResolvedValue({ mood: -2 });
    await act(async () => {
      await result.current.evaluate('I feel sad');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Clear the mock call history
    vi.clearAllMocks();

    // Then evaluate empty text - this should NOT call the API
    await act(async () => {
      await result.current.evaluate('');
    });

    expect(result.current.mood.score).toBe(0);
    expect(result.current.mood.label).toBe('Neutral');
    // Empty text should not trigger API call (clearAllMocks ran before evaluate(''))
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('should set score directly with setScore', () => {
    const { result } = renderHook(() => useMoodEngine());

    act(() => {
      result.current.setScore(5);
    });

    expect(result.current.mood.score).toBe(5);
  });

  it('should calculate intensity correctly', () => {
    const { result } = renderHook(() => useMoodEngine());

    act(() => {
      result.current.setScore(5);
    });

    expect(result.current.intensity).toBe(1); // |5| / 5 = 1

    act(() => {
      result.current.setScore(-3);
    });

    expect(result.current.intensity).toBe(0.6); // |3| / 5 = 0.6
  });

  it('should set loading state during evaluation', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(fetchJson).mockReturnValue(promise);

    const { result } = renderHook(() => useMoodEngine());

    act(() => {
      result.current.evaluate('test');
    });

    // Should be loading
    expect(result.current.loading).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ mood: 2 });
      await promise;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
