/**
 * LORE-KEEPER PREDICTIVE CONTINUITY ENGINE (PCE)
 * API Routes
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { predictiveContinuityService } from '../services/predictiveContinuityService';
import { logger } from '../logger';

const router = Router();

/**
 * POST /api/predictions/generate
 * Generate predictions based on context
 */
router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entity_ids, decision_ids, insight_ids, claim_ids, message } = req.body;

    const predictions = await predictiveContinuityService.generatePredictions(req.user!.id, {
      entity_ids,
      decision_ids,
      insight_ids,
      claim_ids,
      message,
    });

    res.json({ predictions, count: predictions.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate predictions');
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

/**
 * GET /api/predictions
 * Get predictions for user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { dismissed, prediction_type, scope, limit } = req.query;

    const filters: any = {};
    if (dismissed !== undefined) filters.dismissed = dismissed === 'true';
    if (prediction_type) filters.prediction_type = prediction_type;
    if (scope) filters.scope = scope;
    if (limit) filters.limit = parseInt(limit as string, 10);

    const predictions = await predictiveContinuityService.getPredictions(req.user!.id, filters);

    res.json({ predictions, count: predictions.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get predictions');
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

/**
 * GET /api/predictions/:id
 * Get prediction with evidence
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const explanation = await predictiveContinuityService.explainPrediction(id, req.user!.id);

    if (!explanation) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    res.json({
      ...explanation,
      disclaimer: 'This is a probabilistic projection, not advice.',
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get prediction explanation');
    res.status(500).json({ error: 'Failed to get prediction explanation' });
  }
});

/**
 * POST /api/predictions/:id/dismiss
 * Dismiss a prediction
 */
router.post('/:id/dismiss', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await predictiveContinuityService.dismissPrediction(id, req.user!.id);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to dismiss prediction');
    res.status(500).json({ error: 'Failed to dismiss prediction' });
  }
});

export const predictionsRouter = router;

