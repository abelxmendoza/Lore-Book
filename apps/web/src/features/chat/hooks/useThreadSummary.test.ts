import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../api/threadSummary', () => ({
  fetchThreadSummary: vi.fn(),
  refreshThreadSummary: vi.fn(),
}));
vi.mock('../../../lib/supabase', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { fetchThreadSummary } from '../../../api/threadSummary';
import { useThreadSummary } from './useThreadSummary';

const mockFetch = vi.mocked(fetchThreadSummary);

describe('useThreadSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not surface an error when the thread is not on the server yet (404)', async () => {
    const notFound = new Error('Thread not found') as Error & { status?: number };
    notFound.status = 404;
    mockFetch.mockRejectedValue(notFound);

    const { result } = renderHook(() => useThreadSummary('thread-1', 2));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith('thread-1');
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('surfaces other errors so the retry notice can render', async () => {
    mockFetch.mockRejectedValue(new Error('Internal server error'));

    const { result } = renderHook(() => useThreadSummary('thread-1', 2));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Internal server error');
  });
});
