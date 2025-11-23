import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { DreamsEngine } from '../services/dreams/dreamsEngine';
import { DreamsStorage } from '../services/dreams/dreamsStorage';

const router = Router();
const dreamsEngine = new DreamsEngine();
const dreamsStorage = new DreamsStorage();

/**
 * POST /api/dreams/analyze
 * Process and analyze dreams and aspirations
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing dreams and aspirations');

    const result = await dreamsEngine.process(userId);

    // Save if requested
    if (save) {
      const savedDreamSignals = await dreamsStorage.saveDreamSignals(result.dreamSignals || []);
      const savedAspirationSignals = await dreamsStorage.saveAspirationSignals(result.aspirationSignals || []);
      const savedInsights = await dreamsStorage.saveInsights(result.insights);
      
      result.dreamSignals = savedDreamSignals;
      result.aspirationSignals = savedAspirationSignals;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/dreams/signals
 * Get dream signals
 */
router.get(
  '/signals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    const signals = await dreamsStorage.getDreamSignals(userId, category as any);

    res.json({ signals });
  })
);

/**
 * GET /api/dreams/aspirations
 * Get aspiration signals
 */
router.get(
  '/aspirations',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const aspirations = await dreamsStorage.getAspirationSignals(userId);

    res.json({ aspirations });
  })
);

/**
 * GET /api/dreams/insights
 * Get dream insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const category = req.query.category as string | undefined;

    const insights = await dreamsStorage.getInsights(userId, type, category as any);

    res.json({ insights });
  })
);

/**
 * GET /api/dreams/stats
 * Get dreams statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await dreamsStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

