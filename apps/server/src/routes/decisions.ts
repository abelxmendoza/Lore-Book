import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { DecisionEngine } from '../services/decisions/decisionEngine';
import { DecisionStorage } from '../services/decisions/decisionStorage';

const router = Router();
const decisionEngine = new DecisionEngine();
const decisionStorage = new DecisionStorage();

/**
 * POST /api/decisions/process
 * Process and extract decisions
 */
router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Processing decisions');

    const result = await decisionEngine.process(userId);

    // Save if requested
    if (save) {
      const savedDecisions = await decisionStorage.saveDecisions(result.decisions);
      const savedInsights = await decisionStorage.saveInsights(result.insights);
      
      result.decisions = savedDecisions;
      result.insights = savedInsights;
    }

    res.json(result);
  })
);

/**
 * GET /api/decisions
 * Get decisions for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const category = req.query.category as string | undefined;
    const outcome = req.query.outcome as string | undefined;

    const decisions = await decisionStorage.getDecisions(userId, category, outcome);

    res.json({ decisions });
  })
);

/**
 * GET /api/decisions/insights
 * Get decision insights
 */
router.get(
  '/insights',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const decisionId = req.query.decisionId as string | undefined;

    const insights = await decisionStorage.getInsights(userId, decisionId);

    res.json({ insights });
  })
);

/**
 * GET /api/decisions/stats
 * Get decision statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await decisionStorage.getStats(userId);

    res.json(stats);
  })
);

export default router;

