import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { continuityService } from '../services/continuity/continuityService';

const router = Router();

/**
 * GET /api/continuity/profile
 * Get latest continuity profile
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Getting continuity profile');

    const profile = await continuityService.getContinuityProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'No continuity profile found. Compute one first.' });
    }

    res.json({ profile });
  })
);

/**
 * GET /api/continuity/profile/history
 * Get continuity profile history
 */
router.get(
  '/profile/history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    logger.info({ userId, limit }, 'Getting continuity profile history');

    const history = await continuityService.getContinuityProfileHistory(userId, limit);

    res.json({ profiles: history });
  })
);

/**
 * POST /api/continuity/profile/compute
 * Trigger continuity profile computation
 */
router.post(
  '/profile/compute',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const timeWindowDays = req.body.timeWindowDays ? parseInt(req.body.timeWindowDays, 10) : 365;

    logger.info({ userId, timeWindowDays }, 'Computing continuity profile');

    const profile = await continuityService.computeContinuityProfile(userId, timeWindowDays);

    res.json({ profile });
  })
);

export default router;
