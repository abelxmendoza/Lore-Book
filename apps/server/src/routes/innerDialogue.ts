import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { memoryService } from '../services/memoryService';
import { InnerDialogueEngine } from '../services/innerDialogue';

const router = Router();
const engine = new InnerDialogueEngine();

/**
 * POST /api/inner-dialogue/analyze
 * Analyze inner dialogue voices from journal entries
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Analyzing inner dialogue');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const model = await engine.process({ entries });

    res.json(model);
  })
);

export default router;

