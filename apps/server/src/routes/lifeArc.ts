// =====================================================
// LIFE ARC API ROUTES
// Purpose: API endpoints for recent moments / life arc
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { lifeArcService, type Timeframe } from '../services/lifeArcService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * GET /api/life-arc/recent
 * Get recent life arc for user
 */
router.get(
  '/recent',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      timeframe: z.enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS']).default('LAST_30_DAYS'),
    });

    const query = schema.parse({
      timeframe: req.query.timeframe || 'LAST_30_DAYS',
    });

    const userId = req.user!.id;

    const result = await lifeArcService.getRecentLifeArc(userId, query.timeframe as Timeframe);

    res.json({
      success: true,
      ...result,
    });
  })
);

export default router;

