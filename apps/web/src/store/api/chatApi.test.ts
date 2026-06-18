import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';

import { makeStore } from '../index';
import { chatApi } from './chatApi';

const mockedFetchJson = vi.mocked(fetchJson);

describe('chatApi', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
  });

  it('getThreads fetches the first page and normalizes the response', async () => {
    mockedFetchJson.mockResolvedValueOnce({
      success: true,
      threads: [{ id: 't1', title: 'Hello' }],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });

    const store = makeStore();
    const result = await store.dispatch(chatApi.endpoints.getThreads.initiate({ limit: 30 }));

    expect(result.data).toEqual({
      success: true,
      threads: [{ id: 't1', title: 'Hello' }],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads?limit=30',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object)
    );
  });

  it('getThreads encodes cursor pagination', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true, threads: [] });

    const store = makeStore();
    await store.dispatch(chatApi.endpoints.getThreads.initiate({ limit: 30, cursor: 'abc+123' }));

    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads?limit=30&cursor=abc%2B123',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('createThread invalidates the thread list tag', async () => {
    mockedFetchJson
      .mockResolvedValueOnce({ success: true, threads: [] })
      .mockResolvedValueOnce({ success: true });

    const store = makeStore();
    await store.dispatch(chatApi.endpoints.getThreads.initiate({ limit: 30 }));
    expect(mockedFetchJson).toHaveBeenCalledTimes(1);

    await store.dispatch(
      chatApi.endpoints.createThread.initiate({ id: 'new-id', title: 'Draft' })
    );

    await store.dispatch(chatApi.endpoints.getThreads.initiate({ limit: 30 }));
    expect(mockedFetchJson).toHaveBeenCalledTimes(3);
  });

  it('updateThread PATCHes touchActivity without messages', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true });

    const store = makeStore();
    await store.dispatch(
      chatApi.endpoints.updateThread.initiate({
        threadId: 't1',
        body: { touchActivity: true },
      })
    );

    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads/t1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ touchActivity: true }),
      }),
      expect.any(Object)
    );
  });

  it('deleteThread sends DELETE to the thread endpoint', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true });

    const store = makeStore();
    await store.dispatch(chatApi.endpoints.deleteThread.initiate('t1'));

    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads/t1',
      expect.objectContaining({ method: 'DELETE' }),
      expect.any(Object)
    );
  });

  it('getThreadMessages normalizes an empty payload', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true, messages: [{ id: 'm1' }] });

    const store = makeStore();
    const result = await store.dispatch(chatApi.endpoints.getThreadMessages.initiate('t1'));

    expect(result.data).toEqual({ success: true, messages: [{ id: 'm1' }] });
  });

  it('generateThreadTitle POSTs messages to the title endpoint', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true, title: 'Session' });

    const store = makeStore();
    await store.dispatch(
      chatApi.endpoints.generateThreadTitle.initiate({
        threadId: 't1',
        messages: [{ role: 'user', content: 'hello' }],
      })
    );

    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads/t1/title',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object)
    );
  });

  it('forkThread POSTs to the fork endpoint', async () => {
    mockedFetchJson.mockResolvedValueOnce({ success: true, thread: { id: 'fork-1' } });

    const store = makeStore();
    const result = await store.dispatch(
      chatApi.endpoints.forkThread.initiate({ sourceThreadId: 'src', messageId: 'm9' })
    );

    expect(result.data?.thread?.id).toBe('fork-1');
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/threads/src/fork',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object)
    );
  });

  it('surfaces fetchJson failures as query errors', async () => {
    mockedFetchJson.mockRejectedValueOnce(new Error('Network down'));

    const store = makeStore();
    const result = await store.dispatch(chatApi.endpoints.getThreads.initiate({ limit: 30 }));

    expect(result.error).toMatchObject({ message: 'Network down' });
  });
});
