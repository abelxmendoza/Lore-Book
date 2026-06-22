import { getApiBaseUrl } from '../config/env';

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

export type DatabaseUpgradeSnapshot = {
  status: StorageHealthStatus;
  postgresVersion: string | null;
  postgresMajor: number | null;
  cronJobRunDetailsRows: number | null;
  deprecatedExtensions: string[];
  enabledExtensions: EnabledExtension[];
  warnings: string[];
};

export type EnabledExtension = {
  name: string;
  schema: string;
  version: string;
};

export type DatabaseConnectionHints = {
  databaseUrlConfigured: boolean;
  sslMode: string | null;
  sslEnforcementReady: boolean;
};

export type DbHealthStatus = 'ok' | 'degraded' | 'warn' | 'critical';

export type DbHealthPayload = {
  status: DbHealthStatus;
  missingTables: string[];
  lastSchemaSync: string | null;
  storage: DatabaseStorageSnapshot;
  upgrade: DatabaseUpgradeSnapshot;
  connection: DatabaseConnectionHints;
};

const STATUS_RANK: Record<StorageHealthStatus, number> = {
  ok: 0,
  unknown: 0,
  warn: 1,
  critical: 2,
};

export function opsSeverity(status: StorageHealthStatus): number {
  return STATUS_RANK[status] ?? 0;
}

/** @deprecated use opsSeverity */
export const storageSeverity = opsSeverity;

export function resolveOpsSeverity(payload: DbHealthPayload | null | undefined): number {
  if (!payload) return 0;
  return Math.max(opsSeverity(payload.storage.status), opsSeverity(payload.upgrade.status));
}

export function shouldShowOpsBanner(payload: DbHealthPayload | null | undefined): boolean {
  if (!payload) return false;
  return (
    payload.storage.status === 'warn' ||
    payload.storage.status === 'critical' ||
    payload.upgrade.status === 'warn' ||
    payload.upgrade.status === 'critical'
  );
}

/** @deprecated use shouldShowOpsBanner */
export const shouldShowStorageBanner = (storage: DatabaseStorageSnapshot | null | undefined) =>
  storage?.status === 'warn' || storage?.status === 'critical';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatUtilizationPercent(ratio: number | null | undefined): string | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return `${Math.round(ratio * 100)}%`;
}

export function buildStorageBannerMessage(
  storage: DatabaseStorageSnapshot,
  opts?: { compact?: boolean }
): string {
  const pct = formatUtilizationPercent(storage.utilizationRatio);
  const used = formatBytes(storage.databaseBytes);
  const quota = formatBytes(storage.quotaBytes);
  const compact = opts?.compact ?? false;

  if (storage.status === 'critical') {
    if (compact) {
      return pct
        ? `DB storage critical (${pct}) — writes may fail`
        : 'DB storage critical — writes may fail';
    }
    return pct
      ? `Database storage critical at ${pct} (${used} of ${quota}). Supabase may block writes — free space or expand disk.`
      : `Database storage is critical. Supabase may block writes — free space or expand disk.`;
  }

  if (storage.status === 'warn') {
    if (compact) {
      return pct ? `DB storage at ${pct} of quota` : 'DB storage nearing quota';
    }
    return pct
      ? `Database storage at ${pct} (${used} of ${quota}). Supabase may enter read-only mode soon.`
      : 'Database storage is nearing quota. Supabase may enter read-only mode soon.';
  }

  return '';
}

export type OpsBannerContent = {
  severity: StorageHealthStatus;
  headline: string;
  details: string[];
  linkLabel: string | null;
  linkUrl: string | null;
};

export function buildOpsBannerContent(
  payload: DbHealthPayload,
  opts?: { compact?: boolean }
): OpsBannerContent {
  const compact = opts?.compact ?? false;
  const details: string[] = [...payload.upgrade.warnings];

  if (
    payload.connection.databaseUrlConfigured &&
    !payload.connection.sslEnforcementReady
  ) {
    details.push(
      payload.connection.sslMode
        ? `DATABASE_URL uses sslmode=${payload.connection.sslMode} — use require or verify-full before enabling Supabase SSL enforcement.`
        : 'DATABASE_URL has no sslmode — add sslmode=require before enabling Supabase SSL enforcement.'
    );
  }

  const storageMsg = buildStorageBannerMessage(payload.storage, { compact });
  const storageRank = opsSeverity(payload.storage.status);
  const upgradeRank = opsSeverity(payload.upgrade.status);

  let severity: StorageHealthStatus = 'ok';
  if (storageRank >= 2 || upgradeRank >= 2) severity = 'critical';
  else if (storageRank >= 1 || upgradeRank >= 1) severity = 'warn';

  let headline = storageMsg;
  if (!headline && payload.upgrade.warnings[0]) {
    headline = compact
      ? 'Postgres upgrade prep needed'
      : payload.upgrade.warnings[0];
  }
  if (!headline && details.length > 0) {
    headline = compact ? 'Database ops attention needed' : details[0]!;
  }

  const linkUrl = (() => {
    if (payload.upgrade.deprecatedExtensions.length > 0) {
      return resolveSupabaseExtensionsUrl();
    }
    if (upgradeRank > 0) return resolveSupabaseInfrastructureUrl();
    return resolveSupabaseDatabaseSettingsUrl();
  })();

  const linkLabel = (() => {
    if (!linkUrl) return null;
    if (payload.upgrade.deprecatedExtensions.length > 0) {
      return 'Open Supabase Extensions';
    }
    if (upgradeRank > 0) return 'Open Supabase infrastructure settings';
    return 'Open Supabase database settings';
  })();

  return {
    severity,
    headline,
    details: details.filter((d) => d !== headline),
    linkLabel,
    linkUrl,
  };
}

export function resolveSupabaseProjectRef(): string | null {
  const ref = import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined;
  if (ref) return ref;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const match = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export function resolveSupabaseDatabaseSettingsUrl(): string | null {
  const ref = resolveSupabaseProjectRef();
  return ref ? `https://supabase.com/dashboard/project/${ref}/database/settings` : null;
}

export function resolveSupabaseInfrastructureUrl(): string | null {
  const ref = resolveSupabaseProjectRef();
  return ref ? `https://supabase.com/dashboard/project/${ref}/settings/infrastructure` : null;
}

export function resolveSupabaseExtensionsUrl(): string | null {
  const ref = resolveSupabaseProjectRef();
  return ref ? `https://supabase.com/dashboard/project/${ref}/database/extensions` : null;
}

export function resolveSupabaseBackupsUrl(): string | null {
  const ref = resolveSupabaseProjectRef();
  return ref
    ? `https://supabase.com/dashboard/project/${ref}/database/backups/scheduled`
    : null;
}

export function resolveDbHealthUrl(apiBase = getApiBaseUrl()): string {
  const base = apiBase.replace(/\/+$/, '');
  return base ? `${base}/api/health/db` : '/api/health/db';
}

export async function fetchDbHealth(
  signal?: AbortSignal,
  apiBase = getApiBaseUrl()
): Promise<DbHealthPayload> {
  const res = await fetch(resolveDbHealthUrl(apiBase), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`DB health probe returned HTTP ${res.status}`);
  }
  return (await res.json()) as DbHealthPayload;
}

export const EMPTY_UPGRADE_SNAPSHOT: DatabaseUpgradeSnapshot = {
  status: 'ok',
  postgresVersion: null,
  postgresMajor: null,
  cronJobRunDetailsRows: null,
  deprecatedExtensions: [],
  enabledExtensions: [],
  warnings: [],
};

export const EMPTY_CONNECTION_HINTS: DatabaseConnectionHints = {
  databaseUrlConfigured: false,
  sslMode: null,
  sslEnforcementReady: false,
};
