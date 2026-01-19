import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { LearningEngine } from '../services/learning/learningEngine';
import type { LearningType, ProficiencyLevel } from '../services/learning/types';

const router = Router();
const learningEngine = new LearningEngine();

/**
 * GET /api/learning
 * Get learning records for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as LearningType | undefined;
    const proficiency = req.query.proficiency as ProficiencyLevel | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const orderBy = (req.query.orderBy as 'date' | 'practice' | 'proficiency') || 'date';

    const payload = await learningEngine.getLearning(userId, {
      type,
      proficiency,
      limit,
      orderBy,
    });

    res.json(payload);
  })
);

/**
 * GET /api/learning/stats
 * Get learning statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await learningEngine.getStats(userId);

    res.json(stats);
  })
);

/**
 * POST /api/learning/extract
 * Manually trigger learning extraction from an entry
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

    logger.info({ userId, entryId }, 'Manually extracting learning');

    const learning = await learningEngine.extractFromEntry(
      userId,
      entryId,
      content,
      entryDate
    );

    res.json({
      success: true,
      learning,
      count: learning.length,
    });
  })
);

export default router;

