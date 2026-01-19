import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { TimeEngine } from '../services/time/timeEngine';
import { TimeStorage } from '../services/time/timeStorage';

const router = Router();
const timeEngine = new TimeEngine();
const timeStorage = new TimeStorage();

/**
 * POST /api/time/analyze
 * Process and analyze time management
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing time management');

    const result = await timeEngine.process(userId);

    // Save if requested
    if (save) {
      const savedEvents = await timeStorage.saveTimeEvents(result.events);
      const savedBlocks = await timeStorage.saveTimeBlocks(result.blocks);
      const savedProcrastination = await timeStorage.saveProcrastinationSignals(result.procrastination);
      await timeStorage.saveEnergyCurve(userId, result.energy);
      const savedScore = await timeStorage.saveTimeScore(userId, result.score);
      const savedInsights = await timeStorage.saveInsights(result.insights || []);
      
      result.events = savedEvents;
      result.blocks = savedBlocks;
      result.procrastination = savedProcrastination;
      if (savedScore) {
        result.score = savedScore;
      }
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/time/events
 * Get time events
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    const events = await timeStorage.getTimeEvents(userId, category as any);

    res.json({ events });
  })
);

/**
 * GET /api/time/blocks
 * Get time blocks
 */
router.get(
  '/blocks',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    const blocks = await timeStorage.getTimeBlocks(userId, category as any);

    res.json({ blocks });
  })
);

/**
 * GET /api/time/procrastination
 * Get procrastination signals
 */
router.get(
  '/procrastination',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const signals = await timeStorage.getProcrastinationSignals(userId, type as any);

    res.json({ signals });
  })
);

/**
 * GET /api/time/energy
 * Get energy curve
 */
router.get(
  '/energy',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const curve = await timeStorage.getLatestEnergyCurve(userId);

    res.json({ energy: curve });
  })
);

/**
 * GET /api/time/score
 * Get latest time score
 */
router.get(
  '/score',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const score = await timeStorage.getLatestTimeScore(userId);

    res.json({ score });
  })
);

/**
 * GET /api/time/stats
 * Get time statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await timeStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;
