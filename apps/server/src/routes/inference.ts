import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { inferenceOrchestrator } from '../services/inference/inferenceOrchestrator';
import type { InferenceDomain, InferenceTier } from '../services/inference/inferenceTypes';
import { ALL_DOMAINS } from '../services/inference/inferenceTypes';

export const inferenceRouter = Router();

const syncBodySchema = z.object({
  tier: z.enum(['t1', 't2']).optional(),
  force: z.boolean().optional(),
  domains: z.array(z.string()).optional(),
});

/** GET /api/inference/status — last run timestamps and report. */
inferenceRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const status = await inferenceOrchestrator.getStatus(userId);
    res.json({ success: true, ...status });
  } catch (error) {
    logger.error({ error, userId }, 'Inference status failed');
    res.status(500).json({ error: 'Status failed' });
  }
});

/**
 * POST /api/inference/sync
 * Materialize lore across books (T1 default, T2 with full rescan).
 */
inferenceRouter.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = syncBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }
  try {
    const tier = (parsed.data.tier ?? 't1') as InferenceTier;
    const domains = parsed.data.domains?.filter((d): d is InferenceDomain =>
      (ALL_DOMAINS as string[]).includes(d)
    );
    const report = await inferenceOrchestrator.sync(userId, {
      tier,
      force: parsed.data.force,
      domains: domains?.length ? domains : undefined,
    });
    res.json({ success: true, report, domains: ALL_DOMAINS });
  } catch (error) {
    logger.error({ error, userId }, 'Inference sync failed');
    res.status(500).json({ error: 'Sync failed' });
  }
});

/** POST /api/inference/schedule — record activity only (used by client after journal save). */
inferenceRouter.post('/schedule', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual';
  inferenceOrchestrator.schedule(userId, reason);
  res.json({ success: true, scheduled: true });
});
