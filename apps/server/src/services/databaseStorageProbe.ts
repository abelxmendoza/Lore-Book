/**
 * Cached database ops probe — O(1) per request after warm cache.
 *
 * Single RPC (`get_database_storage_stats`) returns storage + upgrade signals:
 * pg_database_size, WAL, Postgres version, pg_cron bloat, PG17-deprecated extensions.
 */

import { logger } from '../logger';
import { isSupabaseConfigured, supabaseAdmin } from './supabaseClient';
import {
  evaluateUpgradeReadiness,
  parseOpsRpcPayload,
  type DatabaseUpgradeSnapshot,
} from './databaseUpgradeProbe';

export type { DatabaseUpgradeSnapshot } from './databaseUpgradeProbe';

export type StorageHealthStatus = 'ok' | 'warn' | 'critical' | 'unknown';

export type DatabaseStorageSnapshot = {
  status: StorageHealthStatus;
  databaseBytes: number | null;
  walBytes: number | null;
  quotaBytes: number;
  utilizationRatio: number | null;
  checkedAt: string;
  error?: string;
};

export type DatabaseOpsSnapshot = {
  storage: DatabaseStorageSnapshot;
  upgrade: DatabaseUpgradeSnapshot;
};

const DEFAULT_FREE_DATABASE_QUOTA_BYTES = 500 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const WARN_RATIO = 0.8;
const CRITICAL_RATIO = 0.9;

let cache: { snapshot: DatabaseOpsSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<DatabaseOpsSnapshot> | null = null;

function resolveQuotaBytes(): number {
  const raw = process.env.DB_DATABASE_QUOTA_BYTES;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_FREE_DATABASE_QUOTA_BYTES;
}

function resolveCacheTtlMs(): number {
  const raw = process.env.DB_STORAGE_PROBE_TTL_MS;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 60_000) return parsed;
  }
  return DEFAULT_CACHE_TTL_MS;
}

function statusFromUtilization(ratio: number | null): StorageHealthStatus {
  if (ratio === null) return 'unknown';
  if (ratio >= CRITICAL_RATIO) return 'critical';
  if (ratio >= WARN_RATIO) return 'warn';
  return 'ok';
}

function buildUnknownStorage(checkedAt: string, quotaBytes: number, error: string): DatabaseStorageSnapshot {
  return {
    status: 'unknown',
    databaseBytes: null,
    walBytes: null,
    quotaBytes,
    utilizationRatio: null,
    checkedAt,
    error,
  };
}

async function fetchOpsSnapshot(): Promise<DatabaseOpsSnapshot> {
  const checkedAt = new Date().toISOString();
  const quotaBytes = resolveQuotaBytes();

  if (!isSupabaseConfigured) {
    return {
      storage: buildUnknownStorage(checkedAt, quotaBytes, 'supabase_not_configured'),
      upgrade: evaluateUpgradeReadiness(parseOpsRpcPayload(null)),
    };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('get_database_storage_stats');
    if (error) {
      logger.debug({ error }, 'database_ops_probe: rpc unavailable');
      return {
        storage: buildUnknownStorage(checkedAt, quotaBytes, error.message ?? 'rpc_failed'),
        upgrade: evaluateUpgradeReadiness(parseOpsRpcPayload(null)),
      };
    }

    const parsed = parseOpsRpcPayload(data);
    const utilizationRatio =
      parsed.databaseBytes !== null && quotaBytes > 0
        ? parsed.databaseBytes / quotaBytes
        : null;

    return {
      storage: {
        status: statusFromUtilization(utilizationRatio),
        databaseBytes: parsed.databaseBytes,
        walBytes: parsed.walBytes,
        quotaBytes,
        utilizationRatio,
        checkedAt,
      },
      upgrade: evaluateUpgradeReadiness(parsed),
    };
  } catch (err) {
    logger.warn({ err }, 'database_ops_probe: unexpected failure');
    return {
      storage: buildUnknownStorage(
        checkedAt,
        quotaBytes,
        err instanceof Error ? err.message : 'probe_failed'
      ),
      upgrade: evaluateUpgradeReadiness(parseOpsRpcPayload(null)),
    };
  }
}

/** Cached ops snapshot — dedupes concurrent probes into one RPC. */
export async function probeDatabaseOps(force = false): Promise<DatabaseOpsSnapshot> {
  const now = Date.now();
  if (!force && cache && now < cache.expiresAt) {
    return cache.snapshot;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = fetchOpsSnapshot()
    .then((snapshot) => {
      cache = { snapshot, expiresAt: Date.now() + resolveCacheTtlMs() };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Storage-only view for callers that do not need upgrade signals. */
export async function probeDatabaseStorage(force = false): Promise<DatabaseStorageSnapshot> {
  const ops = await probeDatabaseOps(force);
  return ops.storage;
}

/** @internal test helper */
export function resetDatabaseStorageProbeCache(): void {
  cache = null;
  inFlight = null;
}
