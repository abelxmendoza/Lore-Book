import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { retrieveStoryOfSelfInput } from '../services/storyOfSelf/longitudinalRetrieval';
import { StoryOfSelfEngine } from '../services/storyOfSelf/storyOfSelfEngine';

const router = Router();
const engine = new StoryOfSelfEngine();

/**
 * POST /api/story-of-self/analyze
 * Analyze user's story of self from their memories.
 * Pass ?debug=1 to include the pipeline trace (development diagnostics).
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing story of self');

    const { entries, entities } = await retrieveStoryOfSelfInput(userId);
    const result = await engine.process({ entries, entities, queryIntent: 'story_of_self' });

    const includeTrace = req.query.debug === '1' && process.env.NODE_ENV !== 'production';
    if (includeTrace) {
      res.json(result);
      return;
    }
    const { trace: _trace, ...rest } = result;
    res.json(rest);
  })
);

export default router;
