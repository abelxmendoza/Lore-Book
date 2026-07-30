/**
 * Hard caps for book-query compilers that currently load then slice in memory.
 * Prefer filtering in the DB when possible; these bounds prevent worker OOM /
 * authenticated self-DoS on large tenants.
 */

/** Max rows pulled from a single domain table for query compilation. */
export const BOOK_QUERY_SOURCE_ROW_CAP = 1000;

/** Max location profiles fully materialised (presence / tag analysis). */
export const BOOK_QUERY_LOCATION_PROFILE_CAP = 1000;

/** Concurrent domain fan-out for universal / cross-book query. */
export const BOOK_QUERY_DOMAIN_CONCURRENCY = 3;

/** Max names accepted from a chat roster / "add X, Y, and Z" write. */
export const GROUP_WRITE_MEMBER_NAME_CAP = 25;

/** Org network BFS depth (route + service). */
export const ORG_NETWORK_DEPTH_MIN = 1;
export const ORG_NETWORK_DEPTH_MAX = 8;

export function clampOrgNetworkDepth(raw: number, fallback = 4): number {
  const n = Number.isFinite(raw) ? Math.floor(raw) : fallback;
  if (n < ORG_NETWORK_DEPTH_MIN) return ORG_NETWORK_DEPTH_MIN;
  if (n > ORG_NETWORK_DEPTH_MAX) return ORG_NETWORK_DEPTH_MAX;
  return n;
}
