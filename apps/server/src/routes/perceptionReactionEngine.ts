import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { perceptionReactionEngine } from '../services/perceptionReactionEngine';

const router = Router();

/**
 * Get pattern insights (as questions, never conclusions)
 */
router.get('/patterns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const insights = await perceptionReactionEngine.analyzePatterns(userId);
    res.json({ insights });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get pattern insights');
    res.status(500).json({ error: 'Failed to get pattern insights' });
  }
});

/**
 * Get stability/resilience metrics
 */
router.get('/stability', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const metrics = await perceptionReactionEngine.calculateStabilityMetrics(userId);
    res.json({ metrics });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get stability metrics');
    res.status(500).json({ error: 'Failed to get stability metrics' });
  }
});

/**
 * Get reactions needing time-delayed reflection
 */
router.get('/reflection-needed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const daysDelay = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const reactions = await perceptionReactionEngine.getReactionsNeedingReflection(userId, daysDelay);
    res.json({ reactions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reactions needing reflection');
    res.status(500).json({ error: 'Failed to get reactions needing reflection' });
  }
});

/**
 * Record reflection response
 */
router.post('/reflection/:reactionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { reactionId } = req.params;
    const { response } = req.body;

    if (!response || typeof response !== 'string') {
      return res.status(400).json({ error: 'Reflection response is required' });
    }

    await perceptionReactionEngine.recordReflection(userId, reactionId, response);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record reflection');
    res.status(500).json({ error: 'Failed to record reflection' });
  }
});

/**
 * Update reaction resolution state and outcome
 */
router.patch('/resolution/:reactionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { reactionId } = req.params;
    const schema = z.object({
      resolution_state: z.enum(['active', 'resolved', 'lingering', 'recurring']),
      outcome: z.enum(['avoided', 'confronted', 'self_soothed', 'escalated', 'processed', 'other']).optional(),
      recovery_time_minutes: z.number().int().positive().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid resolution data', details: parsed.error.flatten() });
    }

    await perceptionReactionEngine.updateReactionResolution(
      userId,
      reactionId,
      parsed.data.resolution_state,
      parsed.data.outcome,
      parsed.data.recovery_time_minutes
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update reaction resolution');
    res.status(500).json({ error: 'Failed to update reaction resolution' });
  }
});

export default router;
