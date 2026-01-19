import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { DistortionEngine } from '../services/distortion';
import { memoryService } from '../services/memoryService';

const router = Router();
const engine = new DistortionEngine();

/**
 * POST /api/distortions/analyze
 * Analyze cognitive distortions from journal entries
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing cognitive distortions');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const result = await engine.process({ entries });

    res.json(result);
  })
);

export default router;

