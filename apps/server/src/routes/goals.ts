import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { GoalEngine } from '../services/goals/goalEngine';
import { GoalStorage } from '../services/goals/goalStorage';

const router = Router();
const goalEngine = new GoalEngine();
const goalStorage = new GoalStorage();

/**
 * POST /api/goals/process
 * Process and extract goals
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing goals');

    const result = await goalEngine.process(userId);

    // Save if requested
    if (save) {
      const savedGoals = await goalStorage.saveGoals(result.goals);
      const savedInsights = await goalStorage.saveInsights(result.insights);
      
      result.goals = savedGoals;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/goals
 * Get goals for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const status = req.query.status as string | undefined;

    const goals = await goalStorage.getGoals(userId, status as any);

    res.json({ goals });
  })
);

/**
 * GET /api/goals/insights
 * Get goal insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const goalId = req.query.goalId as string | undefined;

    const insights = await goalStorage.getInsights(userId, goalId);

    res.json({ insights });
  })
);

/**
 * GET /api/goals/stats
 * Get goal statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await goalStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

