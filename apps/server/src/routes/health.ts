import type { Request, Response } from 'express';
import { Router } from 'express';

import { verifySchema, getLastSchemaCheck } from '../db/schemaVerification';
import {
  probeDatabaseOps,
  type DatabaseStorageSnapshot,
  type DatabaseUpgradeSnapshot,
  type StorageHealthStatus,
} from '../services/databaseStorageProbe';
import { mergeOpsStatus } from '../services/databaseUpgradeProbe';
import {
  resolveDatabaseConnectionHints,
  type DatabaseConnectionHints,
} from '../utils/databaseConnectionHints';

/**
 * Liveness/health routes.
 *
 * Extracted from index.ts so the exact payload and status contract can be
 * integration-tested with supertest without booting the whole server (which
 * starts background workers, cron jobs, and the engine scheduler).
 *
 * The `/api/health` route MUST stay dependency-free: no auth, no DB, no async.
 * It is the first thing the platform's edge proxy and our own smoke checks hit,
 * so it has to answer 200 the instant the port is bound. (See the 2026-06-18
 * 502 incident.)
 *
 * `/api/health/db` may touch Postgres (schema + cached storage probe). Keep it
 * off the Railway liveness path — use smoke-health.mjs post-deploy only.
 */

export type HealthPayload = {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  deploymentEnv: string;
  port: number | null;
  envPresent: Record<string, boolean>;
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

export function buildHealthPayload(
  startTime: number,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now()
): HealthPayload {
  const uptimeSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
  const portRaw = env.PORT ? Number(env.PORT) : NaN;

  return {
    status: 'ok',
    timestamp: new Date(now).toISOString(),
    uptimeSeconds,
    deploymentEnv: env.NODE_ENV ?? 'unknown',
    port: Number.isFinite(portRaw) ? portRaw : null,
    envPresent: {
      SUPABASE_URL: !!env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY: !!env.OPENAI_API_KEY,
      FRONTEND_URL: !!env.FRONTEND_URL,
      PORT: !!env.PORT,
      STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!env.STRIPE_WEBHOOK_SECRET,
      SUBSCRIPTION_PRICE_ID: !!env.SUBSCRIPTION_PRICE_ID,
    },
  };
}

/** Merge schema + storage + upgrade into a single operational status (O(1)). */
export function resolveDbHealthStatus(
  schemaOk: boolean,
  storageStatus: StorageHealthStatus,
  upgradeStatus: StorageHealthStatus = 'ok'
): DbHealthStatus {
  if (!schemaOk) return 'degraded';
  const combined = mergeOpsStatus(storageStatus, upgradeStatus);
  if (combined === 'critical') return 'critical';
  if (combined === 'warn') return 'warn';
  return 'ok';
}

export async function buildDbHealthPayload(
  deps: {
    verifySchema?: typeof verifySchema;
    getLastSchemaCheck?: typeof getLastSchemaCheck;
    probeDatabaseOps?: typeof probeDatabaseOps;
    resolveDatabaseConnectionHints?: typeof resolveDatabaseConnectionHints;
  } = {}
): Promise<DbHealthPayload> {
  const verify = deps.verifySchema ?? verifySchema;
  const lastCheck = deps.getLastSchemaCheck ?? getLastSchemaCheck;
  const probe = deps.probeDatabaseOps ?? probeDatabaseOps;
  const connectionHints = deps.resolveDatabaseConnectionHints ?? resolveDatabaseConnectionHints;

  const [schemaResult, ops] = await Promise.all([verify(), probe()]);

  return {
    status: resolveDbHealthStatus(schemaResult.ok, ops.storage.status, ops.upgrade.status),
    missingTables: schemaResult.missingTables,
    lastSchemaSync: lastCheck() ? lastCheck()!.toISOString() : null,
    storage: ops.storage,
    upgrade: ops.upgrade,
    connection: connectionHints(),
  };
}

/** Fallback payload when the DB probes themselves throw (DB unreachable, etc.).
 *  A health endpoint must report status, not 500. */
function buildUnavailableDbHealthPayload(error: unknown): DbHealthPayload {
  const message = error instanceof Error ? error.message : String(error);
  const checkedAt = new Date().toISOString();
  return {
    status: 'critical',
    missingTables: [],
    lastSchemaSync: null,
    storage: {
      status: 'unknown',
      databaseBytes: null,
      walBytes: null,
      quotaBytes: 0,
      utilizationRatio: null,
      checkedAt,
      error: message,
    },
    upgrade: {
      status: 'unknown',
      postgresVersion: null,
      postgresMajor: null,
      cronJobRunDetailsRows: null,
      deprecatedExtensions: [],
      enabledExtensions: [],
      warnings: [message],
    },
    connection: resolveDatabaseConnectionHints(),
  };
}

export async function handleDbHealth(_req: Request, res: Response): Promise<void> {
  try {
    const payload = await buildDbHealthPayload();
    res.status(200).json(payload);
  } catch (error) {
    // Never 500 the health endpoint on a probe failure — report it as critical.
    res.status(200).json(buildUnavailableDbHealthPayload(error));
  }
}

/**
 * Build the liveness router. Mounts a single GET handler at the provided path
 * (default '/api/health'). Returns 200 with {@link HealthPayload}.
 */
export function createHealthRouter(
  startTime: number,
  routePath = '/api/health'
): Router {
  const router = Router();
  router.get(routePath, (_req, res) => {
    res.status(200).json(buildHealthPayload(startTime));
  });
  router.get('/api/health/db', (req, res, next) => {
    void handleDbHealth(req, res).catch(next);
  });
  return router;
}

