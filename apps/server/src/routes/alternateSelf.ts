import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AlternateSelfEngine } from '../services/alternateSelf';
import { memoryService } from '../services/memoryService';

const router = Router();
const engine = new AlternateSelfEngine();

/**
 * POST /api/alternate-self/analyze
 * Analyze alternate selves from journal entries
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing alternate selves');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const model = await engine.process({ entries });

    res.json(model);
  })
);

export default router;

