/**
 * Derive Supabase upgrade-readiness from the ops RPC payload.
 * Aligns with Supabase upgrade + extensions docs (pg_cron bloat, PG17 deprecations).
 */

import type { StorageHealthStatus } from './databaseStorageProbe';
import {
  findDeprecatedEnabled,
  findNonStandardSchemaExtensions,
  parseEnabledExtensions,
  type EnabledExtension,
} from './postgresExtensions';

export type DatabaseUpgradeSnapshot = {
  status: StorageHealthStatus;
  postgresVersion: string | null;
  postgresMajor: number | null;
  cronJobRunDetailsRows: number | null;
  /** Subset of enabled extensions deprecated on the PG17 upgrade path. */
  deprecatedExtensions: string[];
  /** Full extension inventory from pg_extension (O(n), n ≈ 50 on Supabase). */
  enabledExtensions: EnabledExtension[];
  warnings: string[];
};

export type OpsRpcPayload = {
  databaseBytes: number | null;
  walBytes: number | null;
  postgresVersion: string | null;
  postgresMajor: number | null;
  cronJobRunDetailsRows: number | null;
  deprecatedExtensions: string[];
  enabledExtensions: EnabledExtension[];
};

function resolveCronWarnRows(): number {
  const raw = process.env.DB_CRON_WARN_ROWS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100_000;
}

function resolveCronCriticalRows(): number {
  const raw = process.env.DB_CRON_CRITICAL_ROWS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 500_000;
}

export function parseOpsRpcPayload(data: unknown): OpsRpcPayload {
  if (!data || typeof data !== 'object') {
    return {
      databaseBytes: null,
      walBytes: null,
      postgresVersion: null,
      postgresMajor: null,
      cronJobRunDetailsRows: null,
      deprecatedExtensions: [],
      enabledExtensions: [],
    };
  }
  const rec = data as Record<string, unknown>;

  const enabledExtensions = parseEnabledExtensions(rec.enabled_extensions);

  const deprecatedRaw = rec.deprecated_extensions;
  const deprecatedFromRpc = Array.isArray(deprecatedRaw)
    ? deprecatedRaw.filter((x): x is string => typeof x === 'string')
    : [];
  const deprecatedExtensions =
    deprecatedFromRpc.length > 0
      ? deprecatedFromRpc
      : findDeprecatedEnabled(enabledExtensions);

  return {
    databaseBytes:
      typeof rec.database_bytes === 'number' && Number.isFinite(rec.database_bytes)
        ? rec.database_bytes
        : null,
    walBytes:
      typeof rec.wal_bytes === 'number' && Number.isFinite(rec.wal_bytes) ? rec.wal_bytes : null,
    postgresVersion:
      typeof rec.postgres_version === 'string' ? rec.postgres_version : null,
    postgresMajor:
      typeof rec.postgres_major === 'number' && Number.isFinite(rec.postgres_major)
        ? rec.postgres_major
        : null,
    cronJobRunDetailsRows:
      typeof rec.cron_job_run_details_rows === 'number' &&
      Number.isFinite(rec.cron_job_run_details_rows)
        ? rec.cron_job_run_details_rows
        : null,
    deprecatedExtensions,
    enabledExtensions,
  };
}

/** O(n) on extension list + warnings; single pass where possible. */
export function evaluateUpgradeReadiness(payload: OpsRpcPayload): DatabaseUpgradeSnapshot {
  const warnings: string[] = [];
  let status: StorageHealthStatus = 'ok';

  const cronWarn = resolveCronWarnRows();
  const cronCritical = resolveCronCriticalRows();
  const cronRows = payload.cronJobRunDetailsRows;

  if (cronRows !== null) {
    if (cronRows >= cronCritical) {
      status = 'critical';
      warnings.push(
        `pg_cron.job_run_details has ${cronRows.toLocaleString()} rows — prune before upgrading (Supabase duplicates this table during upgrade).`
      );
    } else if (cronRows >= cronWarn) {
      if (status !== 'critical') status = 'warn';
      warnings.push(
        `pg_cron.job_run_details has ${cronRows.toLocaleString()} rows — consider pruning before a Postgres upgrade.`
      );
    }
  }

  const blockingExtensions = payload.deprecatedExtensions;
  if (blockingExtensions.length > 0 && (payload.postgresMajor ?? 0) < 17) {
    if (status !== 'critical') status = 'warn';
    warnings.push(
      `Extensions deprecated on Postgres 17 are enabled: ${blockingExtensions.join(', ')}. Disable them under Database → Extensions before upgrading.`
    );
  }

  const nonStandard = findNonStandardSchemaExtensions(payload.enabledExtensions);
  if (nonStandard.length > 0 && (payload.postgresMajor ?? 0) < 17) {
    const sample = nonStandard
      .slice(0, 4)
      .map((e) => `${e.name}@${e.schema}`)
      .join(', ');
    if (status !== 'critical') status = 'warn';
    warnings.push(
      `${nonStandard.length} extension(s) live outside the Supabase \`extensions\` schema (${sample}${nonStandard.length > 4 ? ', …' : ''}). Review before upgrade — new extension versions may require \`create extension … with schema extensions\`.`
    );
  }

  if (
    payload.postgresMajor !== null &&
    payload.postgresMajor < 15 &&
    status === 'ok'
  ) {
    status = 'warn';
    warnings.push(
      `Postgres ${payload.postgresVersion ?? payload.postgresMajor} is behind current Supabase releases — plan an infrastructure upgrade (extension updates require Infrastructure Settings).`
    );
  }

  return {
    status,
    postgresVersion: payload.postgresVersion,
    postgresMajor: payload.postgresMajor,
    cronJobRunDetailsRows: payload.cronJobRunDetailsRows,
    deprecatedExtensions: blockingExtensions,
    enabledExtensions: payload.enabledExtensions,
    warnings,
  };
}

export function mergeOpsStatus(
  storageStatus: StorageHealthStatus,
  upgradeStatus: StorageHealthStatus
): StorageHealthStatus {
  const rank: Record<StorageHealthStatus, number> = {
    unknown: 0,
    ok: 0,
    warn: 1,
    critical: 2,
  };
  return rank[upgradeStatus] > rank[storageStatus] ? upgradeStatus : storageStatus;
}
