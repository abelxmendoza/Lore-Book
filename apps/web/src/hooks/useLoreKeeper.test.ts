import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoreKeeper } from './useLoreKeeper';
import { fetchJson } from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn()
}));

describe('useLoreKeeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load characters successfully', async () => {
    const mockCharacters = [
      { id: '1', name: 'Test Character', role: 'Friend' }
    ];

    vi.mocked(fetchJson).mockResolvedValueOnce({ characters: mockCharacters });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current.characters).toEqual(mockCharacters);
    });
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });
});

