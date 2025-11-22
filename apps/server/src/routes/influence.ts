import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { InfluenceEngine } from '../services/influence/influenceEngine';
import { InfluenceStorage } from '../services/influence/influenceStorage';

const router = Router();
const influenceEngine = new InfluenceEngine();
const influenceStorage = new InfluenceStorage();

/**
 * POST /api/influence/process
 * Process and analyze influence
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing influence');

    const result = await influenceEngine.process(userId);

    // Save if requested
    if (save) {
      const savedProfiles = await influenceStorage.saveProfiles(result.profiles);
      const savedEvents = await influenceStorage.saveEvents(result.events);
      const savedInsights = await influenceStorage.saveInsights(result.insights);
      
      result.profiles = savedProfiles;
      result.events = savedEvents;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/influence/profiles
 * Get person influence profiles
 */
router.get(
  '/profiles',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const minNetInfluence = req.query.minNetInfluence ? parseFloat(req.query.minNetInfluence as string) : undefined;

    const profiles = await influenceStorage.getProfiles(userId, minNetInfluence);

    res.json({ profiles });
  })
);

/**
 * GET /api/influence/events
 * Get influence events
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const person = req.query.person as string | undefined;

    const events = await influenceStorage.getEvents(userId, person);

    res.json({ events });
  })
);

/**
 * GET /api/influence/insights
 * Get influence insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const person = req.query.person as string | undefined;

    const insights = await influenceStorage.getInsights(userId, type, person);

    res.json({ insights });
  })
);

/**
 * GET /api/influence/stats
 * Get influence statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await influenceStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

