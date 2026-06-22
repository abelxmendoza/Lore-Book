/**
 * Layer 1 — Database Adapter
 *
 * Presents a single typed surface: `supabaseAdmin`.
 * Internal implementation switches between the real Supabase client and the
 * test mock, but callers always see `SupabaseClient<any>` so they get full
 * chain method coverage (or, neq, lt, auth, storage, etc.) without the
 * `unknown`/`{}` type collapse that occurred when the SupabaseMock union
 * leaked into production type inference.
 *
 * The type assertion at the boundary is intentional and correct: the mock
 * implements the same runtime interface as the real client for all operations
 * exercised by production code.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { config } from '../config';
import { createServerSupabaseClient } from '../lib/createServerSupabaseClient';
import { getActiveSupabaseUrl } from '../lib/supabaseUrlResolution';
import { createSupabaseMock } from './supabaseMock';

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';

function resolveSupabaseUrl(): string {
  return getActiveSupabaseUrl() || config.supabaseUrl;
}

function getSupabaseAdminClient(): SupabaseClient {
  if (isTest) {
    return createSupabaseMock() as unknown as SupabaseClient;
  }

  const url = resolveSupabaseUrl();
  const key = config.supabaseServiceRoleKey;
  if (!url || !key) {
    return createSupabaseMock() as unknown as SupabaseClient;
  }

  if (!cachedClient || cachedUrl !== url) {
    cachedUrl = url;
    cachedClient = createServerSupabaseClient(url, key);
  }

  return cachedClient;
}

/**
 * Single source of truth for all server-side DB access.
 * Typed as `SupabaseClient` — always has .from(), .rpc(), .auth, .storage.
 * Lazily rebinds when boot-time URL resolution switches to a fallback host.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdminClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
