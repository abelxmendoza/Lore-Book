import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { PredictionEngine } from '../services/prediction/predictionEngine';

const router = Router();
const predictionEngine = new PredictionEngine();

/**
 * POST /api/prediction/forecast
 * Generate forecast for user
 */
router.post(
  '/forecast',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const horizonDays = req.body.horizonDays || 30;
    const lookbackDays = req.body.lookbackDays || 365;

    logger.info({ userId, horizonDays, lookbackDays }, 'Generating forecast');

    const forecast = await predictionEngine.generateForecast(
      userId,
      horizonDays,
      lookbackDays
    );

    res.json(forecast);
  })
);

/**
 * GET /api/prediction/active
 * Get active predictions
 */
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const type = req.query.type as string | undefined;

    const predictions = await predictionEngine.getActivePredictions(
      userId,
      limit,
      type
    );

    res.json({ predictions });
  })
);

/**
 * GET /api/prediction/range
 * Get predictions by date range
 */
router.get(
  '/range',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required',
      });
    }

    const predictions = await predictionEngine.getPredictionsByDateRange(
      userId,
      startDate,
      endDate
    );

    res.json({ predictions });
  })
);

/**
 * POST /api/prediction/:id/status
 * Update prediction status
 */
router.post(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const predictionId = req.params.id;
    const status = req.body.status;

    if (!status || !['confirmed', 'refuted', 'partial', 'expired'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: confirmed, refuted, partial, expired',
      });
    }

    logger.info({ userId, predictionId, status }, 'Updating prediction status');

    const success = await predictionEngine.updatePredictionStatus(
      predictionId,
      status
    );

    if (!success) {
      return res.status(500).json({
        error: 'Failed to update prediction status',
      });
    }

    res.json({ success: true });
  })
);

/**
 * GET /api/prediction/stats
 * Get prediction statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await predictionEngine.getStats(userId);

    res.json(stats);
  })
);

export default router;

