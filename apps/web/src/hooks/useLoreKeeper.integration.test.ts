import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoreKeeper } from './useLoreKeeper';

// Mock API calls
vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('useLoreKeeper Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useLoreKeeper());
    
    expect(result.current.entries).toEqual([]);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('should load entries on mount', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValueOnce({
      entries: [{ id: '1', content: 'Test entry' }],
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entries).toHaveLength(1);
  });

  it('should create a new entry', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValueOnce({
      id: '2',
      content: 'New entry',
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.createEntry('New entry');

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/entries'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
