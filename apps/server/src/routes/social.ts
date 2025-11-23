import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { SocialNetworkEngine } from '../services/social/socialNetworkEngine';
import { SocialStorage } from '../services/social/socialStorage';

const router = Router();
const socialEngine = new SocialNetworkEngine();
const socialStorage = new SocialStorage();

/**
 * POST /api/social/analyze
 * Process and analyze social network
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing social network');

    const result = await socialEngine.process(userId);

    // Save if requested
    if (save) {
      await socialStorage.saveNodes(userId, result.nodes);
      await socialStorage.saveEdges(result.edges);
      await socialStorage.saveCommunities(result.communities);
      await socialStorage.saveInfluenceScores(result.influence);
      await socialStorage.saveToxicitySignals(result.toxic);
      await socialStorage.saveDriftEvents(result.drift);
      await socialStorage.saveNetworkScore(userId, result.score);
      await socialStorage.saveInsights(result.insights || []);
    }

    res.json(result);
  })
);

/**
 * GET /api/social/stats
 * Get social network statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await socialStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

