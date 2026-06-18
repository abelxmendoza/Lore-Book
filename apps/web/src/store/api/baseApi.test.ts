import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the canonical fetch wrapper so we test the baseQuery adapter in isolation.
vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';

import {
  fetchJsonBaseQuery,
  normalizeFetchJsonError,
  isFetchJsonError,
} from './baseApi';

const mockedFetchJson = vi.mocked(fetchJson);

// Minimal RTK Query BaseQueryApi stub — the adapter doesn't use it.
const api = {} as never;

describe('fetchJsonBaseQuery', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
  });

  it('returns { data } on success and accepts a string arg', async () => {
    mockedFetchJson.mockResolvedValueOnce({ ok: true });
    const result = await fetchJsonBaseQuery('/api/entries', api, {});
    expect(result).toEqual({ data: { ok: true } });
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/entries',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object)
    );
  });

  it('serializes a body for mutations', async () => {
    mockedFetchJson.mockResolvedValueOnce({ id: '1' });
    await fetchJsonBaseQuery(
      { url: '/api/entries', method: 'POST', body: { content: 'hi' } },
      api,
      {}
    );
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/entries',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'hi' }) }),
      expect.any(Object)
    );
  });

  it('forwards mock-data options to fetchJson', async () => {
    mockedFetchJson.mockResolvedValueOnce([]);
    await fetchJsonBaseQuery(
      { url: '/api/quests', mockData: [{ id: 'q1' }], useMockData: true, timeoutMs: 1000 },
      api,
      {}
    );
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/quests',
      expect.any(Object),
      expect.objectContaining({ mockData: [{ id: 'q1' }], useMockData: true, timeoutMs: 1000 })
    );
  });

  it('returns a normalized { error } when fetchJson throws', async () => {
    mockedFetchJson.mockRejectedValueOnce(new Error('Network down'));
    const result = await fetchJsonBaseQuery('/api/entries', api, {});
    expect(result).toMatchObject({
      error: { status: 'FETCH_ERROR', message: 'Network down', name: 'Error' },
    });
  });

  it('rejects an empty url without calling fetchJson', async () => {
    const result = await fetchJsonBaseQuery({ url: '' }, api, {});
    expect(result).toHaveProperty('error.message', 'A request url is required');
    expect(mockedFetchJson).not.toHaveBeenCalled();
  });
});

describe('normalizeFetchJsonError', () => {
  it('extracts numeric status, name, and code when present', () => {
    const err = Object.assign(new Error('boom'), { status: 503, code: 'CONNECTION_REFUSED' });
    err.name = 'NetworkError';
    expect(normalizeFetchJsonError(err)).toEqual({
      status: 503,
      message: 'boom',
      name: 'NetworkError',
      code: 'CONNECTION_REFUSED',
    });
  });

  it('falls back to FETCH_ERROR and a default message', () => {
    expect(normalizeFetchJsonError({})).toEqual({ status: 'FETCH_ERROR', message: 'Request failed' });
    expect(normalizeFetchJsonError('weird')).toEqual({ status: 'FETCH_ERROR', message: 'Request failed' });
  });
});

describe('isFetchJsonError', () => {
  it('identifies normalized errors', () => {
    expect(isFetchJsonError({ status: 'FETCH_ERROR', message: 'x' })).toBe(true);
    expect(isFetchJsonError({ message: 'x' })).toBe(false);
    expect(isFetchJsonError(null)).toBe(false);
    expect(isFetchJsonError('nope')).toBe(false);
  });
});
