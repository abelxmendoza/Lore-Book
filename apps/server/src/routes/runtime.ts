import { Router } from 'express';

import { buildOpenAiPolicySnapshot } from '../config/openaiPolicy';
import { getRegisteredRoutes } from './routeRegistry';

const router = Router();

/**
 * GET /api/runtime/routes
 *
 * Lists all routes in the registry with their classification and active status.
 * Useful for diagnosing 404s in production — shows which routes are disabled
 * because ENABLE_EXPERIMENTAL_RUNTIME=false.
 *
 * No auth required — diagnostic endpoint.
 */
router.get('/routes', (_req, res) => {
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
 */
router.get('/openai-policy', (_req, res) => {
  res.json({ ok: true, ...buildOpenAiPolicySnapshot() });
});

export const runtimeRouter = router;
