import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ValuesEngine } from '../services/values/valuesEngine';
import { ValuesStorage } from '../services/values/valuesStorage';

const router = Router();
const valuesEngine = new ValuesEngine();
const valuesStorage = new ValuesStorage();

/**
 * POST /api/values/analyze
 * Process and analyze values and beliefs
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing values and beliefs');

    const result = await valuesEngine.process(userId);

    // Save if requested
    if (save) {
      const savedValueSignals = await valuesStorage.saveValueSignals(result.valueSignals || []);
      const savedBeliefSignals = await valuesStorage.saveBeliefSignals(result.beliefSignals || []);
      const savedInsights = await valuesStorage.saveInsights(result.insights);
      
      result.valueSignals = savedValueSignals;
      result.beliefSignals = savedBeliefSignals;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/values/signals
 * Get value signals
 */
router.get(
  '/signals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    const signals = await valuesStorage.getValueSignals(userId, category as any);

    res.json({ signals });
  })
);

/**
 * GET /api/values/beliefs
 * Get belief signals
 */
router.get(
  '/beliefs',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const explicitOnly = req.query.explicitOnly === 'true';

    const beliefs = await valuesStorage.getBeliefSignals(userId, explicitOnly);

    res.json({ beliefs });
  })
);

/**
 * GET /api/values/insights
 * Get value insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const category = req.query.category as string | undefined;

    const insights = await valuesStorage.getInsights(userId, type, category as any);

    res.json({ insights });
  })
);

/**
 * GET /api/values/stats
 * Get values statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await valuesStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

