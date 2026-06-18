import { Router } from 'express';

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
 */

export type HealthPayload = {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  deploymentEnv: string;
  port: number | null;
  envPresent: Record<string, boolean>;
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
  return router;
}
