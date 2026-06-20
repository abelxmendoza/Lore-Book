/**
 * Occurrence-time helpers — clamp future dates, resolve user timezone, and derive
 * a single sortable occurrence from the (possibly bounded) temporal context.
 */
import { supabaseAdmin } from '../services/supabaseClient';

export interface OccurrenceTemporalContext {
  start_time?: string | null;
  occurred_before?: string | null;
  occurred_after?: string | null;
}

/**
 * Collapse a temporal_context into ONE sortable millisecond timestamp for
 * chronological ordering — the single point where ordering consumers "consume"
 * the occurrence bounds produced by the temporal layer. Precedence:
 *
 *   start_time                       → exact date
 *   occurred_after + occurred_before → midpoint of the window ("around X")
 *   occurred_before                  → just before that instant ("before the move")
 *   occurred_after                   → just after that instant ("after the wedding")
 *   created_at                       → recorded date (honest fallback; nothing known)
 *
 * `epsilonMs` nudges one-sided bounds just past the anchor so a "before X" memory
 * sorts immediately before X rather than colliding with it.
 */
export function occurrenceSortMs(
  ctx: OccurrenceTemporalContext | null | undefined,
  createdAt: string | Date,
  epsilonMs = 1000,
): number {
  const ms = (v: string | Date | null | undefined): number | null => {
    if (!v) return null;
    const t = (v instanceof Date ? v : new Date(v)).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const start = ms(ctx?.start_time);
  if (start != null) return start;

  const after = ms(ctx?.occurred_after);
  const before = ms(ctx?.occurred_before);
  if (after != null && before != null) return Math.round((after + before) / 2);
  if (before != null) return before - epsilonMs;
  if (after != null) return after + epsilonMs;

  return ms(createdAt) ?? 0;
}

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
