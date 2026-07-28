import { Router, type RequestHandler } from 'express';

import { buildOpenAiPolicySnapshot } from '../config/openaiPolicy';
import { isDevelopmentRuntime, isProductionRuntime } from '../config/runtimePolicy';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { getRegisteredRoutes } from './routeRegistry';

const router = Router();

/** Public only in local development; otherwise auth + admin. */
const runtimeDiagnosticsGate: RequestHandler[] = (() => {
  if (isDevelopmentRuntime() && !isProductionRuntime()) {
    return [];
  }
  return [requireAuth, requireAdmin];
})();

/**
 * GET /api/runtime/routes
 *
 * Lists all routes in the registry with their classification and active status.
 * Useful for diagnosing 404s — shows which routes are disabled because
 * ENABLE_EXPERIMENTAL_RUNTIME=false.
 *
 * Public only in development; production requires auth + admin.
 */
router.get('/routes', ...runtimeDiagnosticsGate, (_req, res) => {
  const routes = getRegisteredRoutes();
  const active = routes.filter((r) => r.active);
  const disabled = routes.filter((r) => !r.active);

  res.json({
    ok: true,
    experimentalEnabled: process.env.ENABLE_EXPERIMENTAL_RUNTIME === 'true',
    counts: { total: routes.length, active: active.length, disabled: disabled.length },
    active: active.map(({ path, classification, description, requiresAuth }) => ({
      path,
      classification,
      description,
      requiresAuth,
    })),
    disabled: disabled.map(({ path, classification, description }) => ({
      path,
      classification,
      description,
    })),
  });
});

/**
 * GET /api/runtime/openai-policy
 *
 * Read-only OpenAI integration policy — conversation state mode, cost guards,
 * and opt-in platform flags. Use post-deploy to verify production matches intent.
 *
 * Public only in development; production requires auth + admin.
 */
router.get('/openai-policy', ...runtimeDiagnosticsGate, (_req, res) => {
  res.json({ ok: true, ...buildOpenAiPolicySnapshot() });
});

export const runtimeRouter = router;
