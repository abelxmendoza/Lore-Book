/**
 * Optional Postgres-backed rate limits via Supabase (free Redis alternative).
 *
 * Enable with RATE_LIMIT_BACKEND=postgres. Fail-open to in-memory if the
 * table/RPC is missing so deploys never break before migrations run.
 */
import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

let postgresAvailable: boolean | null = null;

export function isPostgresRateLimitEnabled(): boolean {
  return process.env.RATE_LIMIT_BACKEND === 'postgres';
}

async function probePostgresRateLimit(): Promise<boolean> {
  if (postgresAvailable != null) return postgresAvailable;
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    postgresAvailable = false;
    return false;
  }
  try {
    const { error } = await supabaseAdmin.rpc('check_api_rate_limit', {
      p_bucket_key: '__probe__',
      p_max: 1,
      p_window_ms: 60_000,
    });
    postgresAvailable = !error;
    if (error) {
      logger.warn(
        { err: error.message },
        'Postgres rate limits unavailable — using in-memory fallback'
      );
    }
  } catch (err) {
    postgresAvailable = false;
    logger.warn({ err }, 'Postgres rate limit probe failed — using in-memory fallback');
  }
  return postgresAvailable;
}

export async function checkPostgresRateLimit(
  bucketKey: string,
  max: number,
  windowMs: number
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number } | null> {
  if (!isPostgresRateLimitEnabled()) return null;
  if (!(await probePostgresRateLimit())) return null;

  const { data, error } = await supabaseAdmin.rpc('check_api_rate_limit', {
    p_bucket_key: bucketKey,
    p_max: max,
    p_window_ms: windowMs,
  });

  if (error) {
    logger.warn({ err: error.message, bucketKey: bucketKey.slice(0, 32) }, 'Postgres rate limit RPC failed');
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  if (row.allowed) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Number(row.retry_after_sec ?? 60)),
  };
}

/** Test helper */
export function resetPostgresRateLimitProbeForTests(): void {
  postgresAvailable = null;
}
