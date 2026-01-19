import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { HabitEngine } from '../services/habits/habitEngine';
import { HabitStorage } from '../services/habits/habitStorage';

const router = Router();
const habitEngine = new HabitEngine();
const habitStorage = new HabitStorage();

/**
 * POST /api/habits/process
 * Process and extract habits
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing habits');

    const result = await habitEngine.process(userId);

    // Save if requested
    if (save) {
      const savedHabits = await habitStorage.saveHabits(result.habits);
      const savedInsights = await habitStorage.saveInsights(result.insights);
      
      result.habits = savedHabits;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/habits
 * Get habits for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    const habits = await habitStorage.getHabits(userId, category);

    res.json({ habits });
  })
);

/**
 * GET /api/habits/insights
 * Get habit insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const habitId = req.query.habitId as string | undefined;

    const insights = await habitStorage.getInsights(userId, habitId);

    res.json({ insights });
  })
);

/**
 * GET /api/habits/stats
 * Get habit statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await habitStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;


