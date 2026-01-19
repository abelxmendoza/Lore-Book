import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { LegacyEngine } from '../services/legacy/legacyEngine';
import { LegacyStorage } from '../services/legacy/legacyStorage';

const router = Router();
const legacyEngine = new LegacyEngine();
const legacyStorage = new LegacyStorage();

/**
 * POST /api/legacy/analyze
 * Process and analyze legacy
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing legacy');

    const result = await legacyEngine.process(userId);

    // Save if requested
    if (save) {
      const savedSignals = await legacyStorage.saveSignals(result.signals);
      const savedClusters = await legacyStorage.saveClusters(result.clusters);
      const savedInsights = await legacyStorage.saveInsights(result.insights);
      
      result.signals = savedSignals;
      result.clusters = savedClusters;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/legacy/signals
 * Get legacy signals
 */
router.get(
  '/signals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const domain = req.query.domain as string | undefined;

    const signals = await legacyStorage.getSignals(userId, domain as any);

    res.json({ signals });
  })
);

/**
 * GET /api/legacy/clusters
 * Get legacy clusters
 */
router.get(
  '/clusters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const clusters = await legacyStorage.getClusters(userId);

    res.json({ clusters });
  })
);

/**
 * GET /api/legacy/insights
 * Get legacy insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const domain = req.query.domain as string | undefined;

    const insights = await legacyStorage.getInsights(userId, type, domain as any);

    res.json({ insights });
  })
);

/**
 * GET /api/legacy/stats
 * Get legacy statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await legacyStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

