import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useContinuity } from './useContinuity';
import { fetchContinuity, fetchMergeSuggestions } from '../api/continuity';
import { fetchJson } from '../lib/api';

vi.mock('../api/continuity', () => ({
  fetchContinuity: vi.fn(),
  fetchMergeSuggestions: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('useContinuity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with null values', () => {
    vi.mocked(fetchContinuity).mockResolvedValue({ continuity: null });
    vi.mocked(fetchMergeSuggestions).mockResolvedValue({ suggestions: [] });
    vi.mocked(fetchJson).mockResolvedValue({ state: null, conflicts: [], report: '' });

    const { result } = renderHook(() => useContinuity());

    expect(result.current.snapshot).toBeNull();
    expect(result.current.mergeSuggestions).toEqual([]);
    expect(result.current.state).toBeNull();
    expect(result.current.conflicts).toEqual([]);
    expect(result.current.report).toBe('');
  });

  it('should load continuity data on mount', async () => {
    const mockSnapshot = {
      id: 'snapshot-1',
      user_id: 'user-1',
      created_at: '2023-01-01',
      events: [],
    };

    const mockSuggestions = [
      { id: 'sug-1', title: 'Merge suggestion', rationale: 'Rationale' },
    ];

    const mockState = {
      registry: { facts: [] },
      driftSummary: {},
      driftSignals: [],
      score: 0.8,
      conflicts: [],
    };

    vi.mocked(fetchContinuity).mockResolvedValue({ continuity: mockSnapshot });
    vi.mocked(fetchMergeSuggestions).mockResolvedValue({ suggestions: mockSuggestions });
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ state: mockState })
      .mockResolvedValueOnce({ conflicts: [] })
      .mockResolvedValueOnce({ report: 'Test report' });

    const { result } = renderHook(() => useContinuity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.snapshot).toEqual(mockSnapshot);
    expect(result.current.mergeSuggestions).toEqual(mockSuggestions);
    expect(result.current.state).toEqual(mockState);
    expect(result.current.report).toBe('Test report');
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fetchContinuity).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useContinuity());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('should handle partial failures', async () => {
    vi.mocked(fetchContinuity).mockResolvedValue({ continuity: null });
    vi.mocked(fetchMergeSuggestions).mockResolvedValue({ suggestions: [] });
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ state: null })
      .mockRejectedValueOnce(new Error('Conflict fetch failed'))
      .mockResolvedValueOnce({ report: '' });

    const { result } = renderHook(() => useContinuity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should still have empty conflicts array from fallback
    expect(result.current.conflicts).toEqual([]);
  });

  it('should refresh data when refresh is called', async () => {
    const mockSnapshot = {
      id: 'snapshot-2',
      user_id: 'user-1',
      created_at: '2023-01-02',
      events: [],
    };

    vi.mocked(fetchContinuity)
      .mockResolvedValueOnce({ continuity: null })
      .mockResolvedValueOnce({ continuity: mockSnapshot });
    vi.mocked(fetchMergeSuggestions)
      .mockResolvedValueOnce({ suggestions: [] })
      .mockResolvedValueOnce({ suggestions: [] });
    vi.mocked(fetchJson)
      .mockResolvedValue({ state: null, conflicts: [], report: '' });

    const { result } = renderHook(() => useContinuity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.refresh();

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(mockSnapshot);
    });
  });

  it('should merge conflicts from state and conflicts endpoint', async () => {
    const stateConflicts = [
      {
        conflict_type: 'contradiction',
        description: 'State conflict',
        severity: 'high',
        subjects: ['subject1'],
        evidence: [],
      },
    ];

    const endpointConflicts = [
      {
        conflict_type: 'drift',
        description: 'Endpoint conflict',
        severity: 'medium',
        subjects: ['subject2'],
        evidence: [],
      },
    ];

    vi.mocked(fetchContinuity).mockResolvedValue({ continuity: null });
    vi.mocked(fetchMergeSuggestions).mockResolvedValue({ suggestions: [] });
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ state: { registry: { facts: [] }, driftSummary: {}, driftSignals: [], score: 0.5, conflicts: stateConflicts } })
      .mockResolvedValueOnce({ conflicts: endpointConflicts })
      .mockResolvedValueOnce({ report: '' });

    const { result } = renderHook(() => useContinuity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should prefer endpoint conflicts over state conflicts
    expect(result.current.conflicts).toEqual(endpointConflicts);
  });
});
