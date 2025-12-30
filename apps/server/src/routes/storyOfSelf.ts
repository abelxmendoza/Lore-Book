import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { memoryService } from '../services/memoryService';
import { StoryOfSelfEngine } from '../services/storyOfSelf/storyOfSelfEngine';

const router = Router();
const engine = new StoryOfSelfEngine();

/**
 * POST /api/story-of-self/analyze
 * Analyze user's story of self from their memories
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing story of self');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const result = await engine.process({
      entries,
    });

    res.json(result);
  })
);

export default router;

