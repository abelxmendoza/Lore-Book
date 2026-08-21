/**
 * Cached database ops probe — O(1) per request after warm cache.
 *
 * Single RPC (`get_database_storage_stats`) returns storage + upgrade signals:
 * pg_database_size, WAL, Postgres version, pg_cron bloat, PG17-deprecated extensions.
 * A separate SHOW query detects Spend Cap / quota read-only mode.
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

export type WriteBlockedReason = 'read_only' | 'disk_full' | 'in_recovery';

export type DatabaseStorageSnapshot = {
  status: StorageHealthStatus;
  databaseBytes: number | null;
  walBytes: number | null;
  quotaBytes: number;
  utilizationRatio: number | null;
  checkedAt: string;
  error?: string;
  /** True when Postgres is refusing writes (spend cap, disk quota, replica). */
  writeBlocked: boolean;
  writeBlockedReason: WriteBlockedReason | null;
};

export type DatabaseOpsSnapshot = {
  storage: DatabaseStorageSnapshot;
  upgrade: DatabaseUpgradeSnapshot;
};

export type WriteModeProbeResult = {
  defaultReadOnly: boolean;
  inRecovery: boolean;
};

type WriteModeProbe = () => Promise<WriteModeProbeResult | null>;

const DEFAULT_FREE_DATABASE_QUOTA_BYTES = 500 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const WARN_RATIO = 0.8;
const CRITICAL_RATIO = 0.9;

let cache: { snapshot: DatabaseOpsSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<DatabaseOpsSnapshot> | null = null;
let pendingWriteBlock: WriteBlockedReason | null = null;
let writeModeProbe: WriteModeProbe = defaultWriteModeProbe;

function parsePgOnOff(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return lower === 'on' || lower === 'true' || lower === '1';
  }
  return false;
}

async function defaultWriteModeProbe(): Promise<WriteModeProbeResult | null> {
  const { postgresClient } = await import('../db/drizzle/client');
  if (!postgresClient) return null;
  try {
    const rows = await postgresClient<{ default_ro: string; in_recovery: boolean }>`
      select current_setting('default_transaction_read_only') as default_ro,
             pg_is_in_recovery() as in_recovery
    `;
    const row = rows[0];
    if (!row) return { defaultReadOnly: false, inRecovery: false };
    return {
      defaultReadOnly: parsePgOnOff(row.default_ro),
      inRecovery: Boolean(row.in_recovery),
    };
  } catch (err) {
    logger.debug({ err }, 'database_ops_probe: write-mode check failed');
    return null;
  }
}

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

function applyWriteBlock(
  storage: DatabaseStorageSnapshot,
  reason: WriteBlockedReason
): DatabaseStorageSnapshot {
  return {
    ...storage,
    status: 'critical',
    writeBlocked: true,
    writeBlockedReason: reason,
  };
}

function attachWriteMode(
  storage: DatabaseStorageSnapshot,
  writeMode: WriteModeProbeResult | null
): DatabaseStorageSnapshot {
  if (writeMode?.defaultReadOnly) {
    pendingWriteBlock = pendingWriteBlock ?? 'read_only';
    return applyWriteBlock(storage, pendingWriteBlock);
  }
  if (writeMode?.inRecovery) {
    pendingWriteBlock = pendingWriteBlock ?? 'in_recovery';
    return applyWriteBlock(storage, pendingWriteBlock);
  }
  if (writeMode && !writeMode.defaultReadOnly && !writeMode.inRecovery) {
    pendingWriteBlock = null;
    return { ...storage, writeBlocked: false, writeBlockedReason: null };
  }
  if (pendingWriteBlock) {
    return applyWriteBlock(storage, pendingWriteBlock);
  }
  return storage;
}

function buildUnknownStorage(checkedAt: string, quotaBytes: number, error: string): DatabaseStorageSnapshot {
  const base: DatabaseStorageSnapshot = {
    status: 'unknown',
    databaseBytes: null,
    walBytes: null,
    quotaBytes,
    utilizationRatio: null,
    checkedAt,
    error,
    writeBlocked: false,
    writeBlockedReason: null,
  };
  return attachWriteMode(base, null);
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
    const [{ data, error }, writeMode] = await Promise.all([
      supabaseAdmin.rpc('get_database_storage_stats'),
      writeModeProbe(),
    ]);
    if (error) {
      logger.debug({ error }, 'database_ops_probe: rpc unavailable');
      return {
        storage: attachWriteMode(
          buildUnknownStorage(checkedAt, quotaBytes, error.message ?? 'rpc_failed'),
          writeMode
        ),
        upgrade: evaluateUpgradeReadiness(parseOpsRpcPayload(null)),
      };
    }

    const parsed = parseOpsRpcPayload(data);
    const utilizationRatio =
      parsed.databaseBytes !== null && quotaBytes > 0
        ? parsed.databaseBytes / quotaBytes
        : null;

    const storage: DatabaseStorageSnapshot = {
      status: statusFromUtilization(utilizationRatio),
      databaseBytes: parsed.databaseBytes,
      walBytes: parsed.walBytes,
      quotaBytes,
      utilizationRatio,
      checkedAt,
      writeBlocked: false,
      writeBlockedReason: null,
    };

    return {
      storage: attachWriteMode(storage, writeMode),
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

/**
 * Stamp the cached probe as write-blocked as soon as a save fails.
 * The next /api/health/db poll then shows a notice without waiting for TTL.
 */
export function noteDatabaseWriteBlocked(reason: WriteBlockedReason): void {
  pendingWriteBlock = reason;
  if (cache) {
    cache.snapshot = {
      ...cache.snapshot,
      storage: applyWriteBlock(cache.snapshot.storage, reason),
    };
  }
}

/** @internal test helper */
export function resetDatabaseStorageProbeCache(): void {
  cache = null;
  inFlight = null;
  pendingWriteBlock = null;
  writeModeProbe = defaultWriteModeProbe;
}

/** @internal test helper */
export function setWriteModeProbeForTests(probe: WriteModeProbe | null): void {
  writeModeProbe = probe ?? defaultWriteModeProbe;
}
