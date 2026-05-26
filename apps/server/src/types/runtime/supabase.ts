/**
 * Typed Supabase result extraction helpers.
 *
 * Root problem: supabaseAdmin is typed as SupabaseMock | SupabaseClient.
 * The mock's `data` field is `unknown` which collapses all downstream array
 * operations (.map, .filter, .length, .find, .reduce) to type errors.
 *
 * These helpers are the canonical extraction layer — they accept the raw
 * `{ data: unknown; error: unknown }` result and return a properly typed
 * value, never silencing the error but converting it to a recoverable state.
 *
 * NO `as any` at call sites — callers pass the query result and receive T.
 */

export type SupabaseResult<T = unknown> = {
  data: T | null;
  error: unknown;
  count?: number | null;
};

/**
 * Extract a typed array from a SELECT result.
 * Returns empty array on DB error — callers that need to distinguish
 * "error" from "empty" should check error separately before calling.
 */
export function getRows<T>(result: SupabaseResult): T[] {
  if (result.error) return [];
  if (!Array.isArray(result.data)) return [];
  return result.data as T[];
}

/**
 * Extract a typed single row from a .single() or .maybeSingle() result.
 * Returns null on error or missing row.
 */
export function getSingle<T>(result: SupabaseResult): T | null {
  if (result.error) return null;
  if (result.data === null || result.data === undefined) return null;
  return result.data as T;
}

/**
 * Assert rows — throws on DB error, returns typed array on success.
 * Use when a DB failure should propagate as an HTTP 500.
 */
export function assertRows<T>(result: SupabaseResult): T[] {
  if (result.error) {
    throw Object.assign(new Error(`Database error: ${JSON.stringify(result.error)}`), {
      status: 500,
    });
  }
  if (!Array.isArray(result.data)) return [];
  return result.data as T[];
}

/**
 * Assert single — throws on DB error, returns typed row or null on success.
 */
export function assertSingle<T>(result: SupabaseResult): T | null {
  if (result.error) {
    throw Object.assign(new Error(`Database error: ${JSON.stringify(result.error)}`), {
      status: 500,
    });
  }
  if (result.data === null || result.data === undefined) return null;
  return result.data as T;
}

/**
 * Extract count from a Supabase SELECT with { count: 'exact' }.
 */
export function getCount(result: SupabaseResult): number {
  return result.count ?? 0;
}
