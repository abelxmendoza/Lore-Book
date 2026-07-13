/**
 * User timezone resolution + persistence.
 *
 * Precedence: request header (X-User-Timezone) > saved profile timezone >
 * UTC. Stores IANA names ("America/Los_Angeles"), never fixed offsets.
 * Persisted in auth user_metadata so async ingestion workers (which have no
 * request) can resolve the user's frame later.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const IANA_RE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;

export function isValidIanaTimezone(tz: string | null | undefined): tz is string {
  if (!tz || !IANA_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, { tz: string; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Timezone for background work (no request available): profile or UTC. */
export async function getUserTimezone(userId: string): Promise<string> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tz;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const tz = (data?.user?.user_metadata as Record<string, unknown> | undefined)?.timezone;
    const resolved = isValidIanaTimezone(typeof tz === 'string' ? tz : null) ? (tz as string) : 'UTC';
    cache.set(userId, { tz: resolved, at: Date.now() });
    return resolved;
  } catch {
    return 'UTC';
  }
}

/**
 * Resolve from a live request and persist changes to the profile
 * (fire-and-forget) so ingestion jobs processed later use the same frame.
 */
export function resolveRequestTimezone(
  userId: string | undefined,
  headerValue: string | string[] | undefined,
): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!isValidIanaTimezone(raw ?? null)) return 'UTC';
  const tz = raw as string;
  if (userId) {
    const cached = cache.get(userId);
    if (!cached || cached.tz !== tz) {
      cache.set(userId, { tz, at: Date.now() });
      supabaseAdmin.auth.admin
        .updateUserById(userId, { user_metadata: { timezone: tz } })
        .then(({ error }) => {
          if (error) logger.debug({ error, userId }, 'timezone persist failed');
        });
    }
  }
  return tz;
}
