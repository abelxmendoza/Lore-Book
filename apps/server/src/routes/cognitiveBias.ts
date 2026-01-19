import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { CognitiveBiasEngine } from '../services/cognitiveBias';
import { memoryService } from '../services/memoryService';

const router = Router();
const engine = new CognitiveBiasEngine();

/**
 * POST /api/cognitive-bias/analyze
 * Analyze cognitive biases from journal entries
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing cognitive biases');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const profile = await engine.process({ entries });

    res.json(profile);
  })
);

export default router;

