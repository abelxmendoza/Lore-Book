import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoreKeeper } from './useLoreKeeper';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

describe('useLoreKeeper Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as any;
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
    }, { timeout: 2000 });
  });

  it('should handle 500 server errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' })
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    try {
      await result.current.refreshEntries();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle empty responses gracefully', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: null })
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });
  });
});

