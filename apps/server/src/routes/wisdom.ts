import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import type { WisdomCategory } from '../services/wisdom/types';
import { WisdomEngine } from '../services/wisdom/wisdomEngine';

const router = Router();
const wisdomEngine = new WisdomEngine();

/**
 * GET /api/wisdom
 * Get wisdom statements for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as WisdomCategory | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const orderBy = (req.query.orderBy as 'date' | 'recurrence' | 'confidence') || 'date';

    const payload = await wisdomEngine.getWisdom(userId, {
      category,
      limit,
      orderBy,
    });

    res.json(payload);
  })
);

/**
 * GET /api/wisdom/stats
 * Get wisdom statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await wisdomEngine.getStats(userId);

    res.json(stats);
  })
);

/**
 * POST /api/wisdom/extract
 * Manually trigger wisdom extraction from an entry
 */
router.post(
  '/extract',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { entryId, content, entryDate } = req.body;

    if (!entryId || !content || !entryDate) {
      return res.status(400).json({
        error: 'Missing required fields: entryId, content, entryDate',
      });
    }

    logger.info({ userId, entryId }, 'Manually extracting wisdom');

    const wisdom = await wisdomEngine.extractFromEntry(
      userId,
      entryId,
      content,
      entryDate
    );

    res.json({
      success: true,
      wisdom,
      count: wisdom.length,
    });
  })
);

export default router;

