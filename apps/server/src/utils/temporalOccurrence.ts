/**
 * Occurrence-time helpers — clamp future dates, resolve user timezone.
 */
import { supabaseAdmin } from '../services/supabaseClient';

const timezoneCache = new Map<string, { tz: string; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Reject LLM/extraction dates far in the future (likely defaults). */
export function clampOccurrenceDate(
  date: Date | string | null | undefined,
  now = new Date(),
  maxFutureDays = 1
): Date | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;

  const maxFuture = now.getTime() + maxFutureDays * 24 * 60 * 60 * 1000;
  if (d.getTime() > maxFuture) return now;

  return d;
}

export async function resolveUserTimezone(userId: string): Promise<string> {
  const cached = timezoneCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.tz;

  let tz = 'UTC';
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.timezone === 'string' && meta.timezone.trim()) {
      tz = meta.timezone.trim();
    }
  } catch {
    /* non-fatal */
  }

  timezoneCache.set(userId, { tz, expires: Date.now() + CACHE_TTL_MS });
  return tz;
}

export async function setUserTimezone(userId: string, timezone: string): Promise<void> {
  const tz = timezone.trim();
  if (!tz) return;
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { timezone: tz },
  });
  timezoneCache.set(userId, { tz, expires: Date.now() + CACHE_TTL_MS });
}
