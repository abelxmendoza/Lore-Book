/**
 * LORE-KEEPER INSIGHT & REFLECTION ENGINE (IRE)
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { insightReflectionService } from '../services/insightReflectionService';

const router = Router();

/**
 * POST /api/insights/generate
 * Generate insights for user
 */
router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const insights = await insightReflectionService.generateInsights(req.user!.id);
    res.json({ insights, count: insights.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate insights');
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

/**
 * GET /api/insights
 * Get insights for user with optional filters
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { type, scope, dismissed, limit } = req.query;

    const filters: any = {};
    if (type) filters.type = type;
    if (scope) filters.scope = scope;
    if (dismissed !== undefined) filters.dismissed = dismissed === 'true';
    if (limit) filters.limit = parseInt(limit as string, 10);

    const insights = await insightReflectionService.getInsights(req.user!.id, filters);
    res.json({ insights, count: insights.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get insights');
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

/**
 * GET /api/insights/:id
 * Get insight explanation with evidence
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const explanation = await insightReflectionService.explainInsight(id, req.user!.id);

    if (!explanation) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    res.json(explanation);
  } catch (error) {
    logger.error({ err: error }, 'Failed to explain insight');
    res.status(500).json({ error: 'Failed to explain insight' });
  }
});

/**
 * POST /api/insights/:id/dismiss
 * Dismiss an insight
 */
router.post('/:id/dismiss', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await insightReflectionService.dismissInsight(id, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to dismiss insight');
    res.status(500).json({ error: 'Failed to dismiss insight' });
  }
});

export const insightsRouter = router;
