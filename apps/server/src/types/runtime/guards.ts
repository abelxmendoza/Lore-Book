/**
 * Runtime type guards for common patterns.
 *
 * These guards eliminate unsafe casts at route boundaries and DB result
 * handling sites. Use instead of `as T` when the shape is user-supplied
 * or comes from an external source.
 */

/** Narrows unknown to string. */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Narrows unknown to number. */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/** Narrows unknown to a non-null object (not array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows unknown to an array. */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Narrows unknown to an array of T given an element guard. */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/** Asserts value is a non-empty string or throws 400. */
export function requireString(value: unknown, name: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw Object.assign(new Error(`Required field missing or non-string: ${name}`), {
    status: 400,
  });
}

/** Extracts a UUID-like string, returning null if absent or malformed. */
export function optionalUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** Coerces unknown to string or returns fallback. */
export function coerceString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
