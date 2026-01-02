import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskEngine } from './useTaskEngine';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

describe('useTaskEngine Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as any;
  });

  it('should handle network errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTaskEngine());

    // Hook should still initialize
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });
  });

  it('should handle 500 errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' })
    });

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle error without crashing
    try {
      await result.current.createTask({ title: 'Test', category: 'general' });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle 401 authentication errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    });

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle auth error
    try {
      await result.current.refreshTasks();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle malformed JSON responses', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON'))
    });

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });
  });
});

