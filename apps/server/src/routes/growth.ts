import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { GrowthEngine } from '../services/growth/growthEngine';
import { GrowthStorage } from '../services/growth/growthStorage';

const router = Router();
const growthEngine = new GrowthEngine();
const growthStorage = new GrowthStorage();

/**
 * POST /api/growth/analyze
 * Process and analyze growth
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing growth');

    const result = await growthEngine.process(userId);

    // Save if requested
    if (save) {
      const savedSignals = await growthStorage.saveSignals(result.signals);
      const savedInsights = await growthStorage.saveInsights(result.insights);
      
      result.signals = savedSignals;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/growth/signals
 * Get growth signals
 */
router.get(
  '/signals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const domain = req.query.domain as string | undefined;

    const signals = await growthStorage.getSignals(userId, domain as any);

    res.json({ signals });
  })
);

/**
 * GET /api/growth/insights
 * Get growth insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const domain = req.query.domain as string | undefined;

    const insights = await growthStorage.getInsights(userId, type, domain as any);

    res.json({ insights });
  })
);

/**
 * GET /api/growth/stats
 * Get growth statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await growthStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

