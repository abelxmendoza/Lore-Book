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
import { createClient } from '@supabase/supabase-js';

import { config } from '../config';
import { createSupabaseMock } from './supabaseMock';

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true';

const missingSupabaseConfig = !config.supabaseUrl || !config.supabaseServiceRoleKey;

function createRealOrFallback(): SupabaseClient {
  if (missingSupabaseConfig) {
    // Fall back to mock when config is absent (e.g. CI without secrets).
    // Cast is safe: mock implements every method production code calls.
    return createSupabaseMock() as unknown as SupabaseClient;
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Single source of truth for all server-side DB access.
 * Typed as `SupabaseClient` — always has .from(), .rpc(), .auth, .storage.
 */
export const supabaseAdmin: SupabaseClient = isTest
  ? (createSupabaseMock() as unknown as SupabaseClient)
  : createRealOrFallback();
