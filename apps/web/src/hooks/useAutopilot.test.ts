import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutopilot } from './useAutopilot';
import { fetchJson } from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('useAutopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with null values', () => {
    vi.mocked(fetchJson).mockResolvedValue({
      daily_plan: null,
      weekly_strategy: null,
      monthly_correction: null,
      arc_transition: null,
      alerts: {},
      momentum: null,
    });

    const { result } = renderHook(() => useAutopilot());

    expect(result.current.dailyPlan).toBeNull();
    expect(result.current.weeklyStrategy).toBeNull();
    expect(result.current.monthlyCorrection).toBeNull();
    expect(result.current.transition).toBeNull();
    expect(result.current.alerts).toEqual({});
    expect(result.current.momentum).toBeNull();
  });

  it('should load autopilot data on mount', async () => {
    const mockDailyPlan = {
      description: 'Test daily plan',
      confidence: 0.8,
      evidence: ['evidence1'],
      suggested_tasks: [],
      urgency: 'medium',
    };

    const mockWeeklyStrategy = {
      description: 'Test weekly strategy',
      confidence: 0.9,
      evidence: ['evidence2'],
      focus_areas: ['area1'],
    };

    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ daily_plan: mockDailyPlan })
      .mockResolvedValueOnce({ weekly_strategy: mockWeeklyStrategy })
      .mockResolvedValueOnce({ monthly_correction: null })
      .mockResolvedValueOnce({ arc_transition: null })
      .mockResolvedValueOnce({ alerts: {} })
      .mockResolvedValueOnce({ momentum: null });

    const { result } = renderHook(() => useAutopilot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dailyPlan).toEqual(mockDailyPlan);
    expect(result.current.weeklyStrategy).toEqual(mockWeeklyStrategy);
    expect(fetchJson).toHaveBeenCalledTimes(6);
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAutopilot());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('should refresh data when refresh is called', async () => {
    const mockDailyPlan = {
      description: 'Updated daily plan',
      confidence: 0.9,
      evidence: [],
      suggested_tasks: [],
      urgency: 'high',
    };

    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ daily_plan: null })
      .mockResolvedValueOnce({ weekly_strategy: null })
      .mockResolvedValueOnce({ monthly_correction: null })
      .mockResolvedValueOnce({ arc_transition: null })
      .mockResolvedValueOnce({ alerts: {} })
      .mockResolvedValueOnce({ momentum: null })
      .mockResolvedValueOnce({ daily_plan: mockDailyPlan })
      .mockResolvedValueOnce({ weekly_strategy: null })
      .mockResolvedValueOnce({ monthly_correction: null })
      .mockResolvedValueOnce({ arc_transition: null })
      .mockResolvedValueOnce({ alerts: {} })
      .mockResolvedValueOnce({ momentum: null });

    const { result } = renderHook(() => useAutopilot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.refresh();

    await waitFor(() => {
      expect(result.current.dailyPlan).toEqual(mockDailyPlan);
    });
  });

  it('should set loading state during refresh', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(fetchJson).mockReturnValue(promise as any);

    const { result } = renderHook(() => useAutopilot());

    // Trigger refresh
    const refreshPromise = result.current.refresh();

    expect(result.current.loading).toBe(true);

    resolvePromise!({ daily_plan: null, weekly_strategy: null, monthly_correction: null, arc_transition: null, alerts: {}, momentum: null });

    await refreshPromise;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
