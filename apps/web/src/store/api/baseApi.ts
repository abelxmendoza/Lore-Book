import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';

import { fetchJson } from '../../lib/api';

export interface FetchJsonArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Per-request mock fallback (forwarded to fetchJson). */
  mockData?: unknown;
  useMockData?: boolean;
  timeoutMs?: number;
}

export interface FetchJsonError {
  status: number | 'FETCH_ERROR';
  message: string;
  /** Original error name (e.g. AbortError, NetworkError) when available. */
  name?: string;
  /** App-level error code (e.g. CONNECTION_REFUSED) when fetchJson surfaces one. */
  code?: string;
}

/** Type guard for RTK Query errors raised by the fetchJson baseQuery. */
export function isFetchJsonError(error: unknown): error is FetchJsonError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'status' in error
  );
}

/** Normalize anything thrown by fetchJson into a serializable RTK Query error. */
export function normalizeFetchJsonError(error: unknown): FetchJsonError {
  const err = error as { message?: unknown; name?: unknown; status?: unknown; code?: unknown };
  const status = typeof err?.status === 'number' ? err.status : 'FETCH_ERROR';
  return {
    status,
    message:
      typeof err?.message === 'string' && err.message.length > 0
        ? err.message
        : 'Request failed',
    ...(typeof err?.name === 'string' ? { name: err.name } : {}),
    ...(typeof err?.code === 'string' ? { code: err.code } : {}),
  };
}

/**
 * RTK Query baseQuery delegating to the app's canonical `fetchJson`.
 * This preserves Supabase auth headers, CSRF acquisition, mock-data fallbacks,
 * the HTML-routing guard, and timeout handling in one place.
 *
 * Exported for unit testing.
 */
export const fetchJsonBaseQuery: BaseQueryFn<FetchJsonArgs | string, unknown, FetchJsonError> = async (
  args
) => {
  const config: FetchJsonArgs = typeof args === 'string' ? { url: args } : args;
  const { url, method = 'GET', body, mockData, useMockData, timeoutMs } = config;

  if (!url || typeof url !== 'string') {
    return { error: { status: 'FETCH_ERROR', message: 'A request url is required' } };
  }

  try {
    const data = await fetchJson(
      url,
      {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      {
        ...(mockData !== undefined ? { mockData } : {}),
        ...(useMockData !== undefined ? { useMockData } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      }
    );
    return { data };
  } catch (error) {
    return { error: normalizeFetchJsonError(error) };
  }
};

/**
 * Single API slice for all server-state. Feature APIs extend this via
 * `injectEndpoints` so the whole app shares one cache + one middleware.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchJsonBaseQuery,
  // Server-state domains. Mutations invalidate these tags so subscribers refetch
  // automatically — replacing the legacy `lk:*-updated` window-event bus.
  tagTypes: [
    'Character',
    'Location',
    'Organization',
    'Quest',
    'Project',
    'Skill',
    'Event',
    'RomanticRelationship',
    'Entry',
    'Timeline',
    'Chapter',
    'Story',
    'ChatThread',
    'ChatMessage',
  ],
  endpoints: () => ({}),
});
