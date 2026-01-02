import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { InterventionEngine } from '../services/intervention/interventionEngine';

const router = Router();
const interventionEngine = new InterventionEngine();

/**
 * POST /api/intervention/process
 * Process interventions for user
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing interventions');

    const interventions = await interventionEngine.process(userId, save);

    res.json({ interventions });
  })
);

/**
 * GET /api/intervention/active
 * Get active interventions
 */
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const minSeverity = req.query.minSeverity as 'low' | 'medium' | 'high' | 'critical' | undefined;

    const interventions = await interventionEngine.getActiveInterventions(
      userId,
      limit,
      minSeverity
    );

    res.json({ interventions });
  })
);

/**
 * POST /api/intervention/:id/status
 * Update intervention status
 */
router.post(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const interventionId = req.params.id;
    const status = req.body.status;

    if (!status || !['acknowledged', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: acknowledged, resolved, dismissed',
      });
    }

    logger.info({ userId, interventionId, status }, 'Updating intervention status');

    const success = await interventionEngine.updateStatus(interventionId, status);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to update intervention status',
      });
    }

    res.json({ success: true });
  })
);

/**
 * GET /api/intervention/stats
 * Get intervention statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await interventionEngine.getStats(userId);

    res.json(stats);
  })
);

export default router;

