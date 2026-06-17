/**
 * Recent life narrative — significant events, patterns, and LLM summary.
 * Distinct from /api/life-arcs (CRUD for arc containers).
 */

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { lifeArcService, type Timeframe } from '../services/lifeArcService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const timeframeSchema = z.enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS']);

/**
 * GET /api/life-arc/recent?timeframe=LAST_30_DAYS
 */
router.get(
  '/recent',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = timeframeSchema.safeParse(req.query.timeframe ?? 'LAST_30_DAYS');
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid timeframe', details: parsed.error.flatten() });
    }

    const timeframe = parsed.data as Timeframe;
    const userId = req.user!.id;

    try {
      const result = await lifeArcService.getRecentLifeArc(userId, timeframe);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error({ error, userId, timeframe }, 'Failed to get recent life arc');
      res.status(500).json({ success: false, error: 'Failed to load recent life arc' });
    }
  })
);

export default router;
