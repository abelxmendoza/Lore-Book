/**
 * Express query-param normalization helpers.
 *
 * Express types req.query values as `string | string[] | ParsedQs | ParsedQs[]`
 * because multi-value params are legal HTTP. These helpers collapse that union
 * to plain `string` at the route boundary where you know the param is scalar.
 *
 * Usage:
 *   const userId = requireStringQuery(req.query.userId, 'userId');
 *   const cursor = optionalStringQuery(req.query.cursor);
 */

import type { Request } from 'express';
import type { ParsedQs } from 'qs';

type RawQueryValue = string | string[] | ParsedQs | ParsedQs[] | (string | ParsedQs)[] | undefined;

/**
 * Extracts a required scalar string from a query param.
 * Throws a 400-tagged Error if the param is absent or non-string.
 */
export function requireStringQuery(value: RawQueryValue, name: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0] as string;
  const err = Object.assign(new Error(`Missing required query parameter: ${name}`), {
    status: 400,
  });
  throw err;
}

/**
 * Extracts an optional scalar string from a query param.
 * Returns undefined when absent or non-string (never throws).
 */
export function optionalStringQuery(value: RawQueryValue): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0] as string;
  return undefined;
}

/**
 * Extracts query params from a request, returning typed strings.
 * Convenience wrapper for routes that need several params at once.
 */
export function extractStringParams<K extends string>(
  req: Request,
  keys: K[]
): Record<K, string | undefined> {
  return Object.fromEntries(
    keys.map((k) => [k, optionalStringQuery(req.query[k])])
  ) as Record<K, string | undefined>;
}
