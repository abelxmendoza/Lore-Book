import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { ActivityResolver } from '../services/activities/activityResolver';
import { ActivityStorage } from '../services/activities/storageService';

const router = Router();
const resolver = new ActivityResolver();
const storage = new ActivityStorage();

/**
 * POST /api/activities/resolve
 * Resolve activities from journal entries
 */
router.post(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const context = {
      entries: req.body.entries || req.body.context?.entries || [],
      user: { id: userId },
    };

    logger.info({ userId, entries: context.entries.length }, 'Resolving activities');

    const resolved = await resolver.process(context);

    res.json({ activities: resolved });
  })
);

/**
 * GET /api/activities
 * Get all activities for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;

    logger.info({ userId, category }, 'Getting activities');

    let activities = await storage.loadAll(userId);

    if (category) {
      activities = activities.filter(a => a.category === category);
    }

    res.json({ activities });
  })
);

/**
 * GET /api/activities/:id
 * Get specific activity
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const activities = await storage.loadAll(userId);
    const activity = activities.find(a => a.id === id);

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json({ activity });
  })
);

export default router;

