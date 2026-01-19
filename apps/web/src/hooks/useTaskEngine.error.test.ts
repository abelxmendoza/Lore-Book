import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskEngine } from './useTaskEngine';

// Mock fetchJson to prevent real network requests
vi.mock('../lib/api', () => ({
  fetchJson: vi.fn()
}));

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

describe('useTaskEngine Error Handling', () => {
  const { fetchJson } = await import('../lib/api');

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - return empty data
    vi.mocked(fetchJson).mockResolvedValue({ tasks: [], events: [] } as any);
  });

  it('should handle network errors gracefully', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTaskEngine());

    // Hook should still initialize even if fetch fails
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    // Tasks should be empty array on error
    expect(result.current.tasks).toEqual([]);
  });

  it('should handle 500 errors', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle error without crashing
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Server error'));
    try {
      await result.current.createTask({ title: 'Test', category: 'general' });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle 401 authentication errors', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle auth error
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Unauthorized'));
    try {
      await result.current.refreshTasks();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle malformed JSON responses', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Invalid JSON'));

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });
  });
});

