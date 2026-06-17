/**
 * LOREBOOK EXPLAINABILITY & META CONTINUITY LAYER
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { continuityService as continuityAnalysisService } from '../services/continuity/continuityService';
import { continuityService as explainabilityContinuityService } from '../services/continuityService';

const router = Router();

function usesExplainabilityFilters(query: AuthenticatedRequest['query']): boolean {
  return !!(
    query.severity ||
    query.reversible !== undefined ||
    query.start_date ||
    query.end_date ||
    query.offset
  );
}

/**
 * GET /api/continuity/events
 * List continuity events with optional filters
 */
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    if (usesExplainabilityFilters(req.query)) {
      const {
        type,
        severity,
        reversible,
        start_date,
        end_date,
        limit,
        offset,
      } = req.query;

      const filters: Record<string, unknown> = {};
      if (type) filters.type = type;
      if (severity) filters.severity = severity;
      if (reversible !== undefined) filters.reversible = reversible === 'true';
      if (start_date) filters.start_date = start_date as string;
      if (end_date) filters.end_date = end_date as string;
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (offset) filters.offset = parseInt(offset as string, 10);

      const events = await explainabilityContinuityService.listEvents(userId, filters);
      return res.json({ events });
    }

    const { type, limit } = req.query;
    const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
    const events = await continuityAnalysisService.getContinuityEvents(
      userId,
      type as string | undefined,
      parsedLimit
    );

    res.json({ events });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list continuity events');
    res.status(500).json({ error: 'Failed to list continuity events' });
  }
});

/**
 * GET /api/continuity/goals
 * Active and abandoned goals for the continuity dashboard
 */
router.get('/goals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const goals = await continuityAnalysisService.getGoals(req.user!.id);
    res.json(goals);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get continuity goals');
    res.status(500).json({ error: 'Failed to get continuity goals' });
  }
});

/**
 * GET /api/continuity/contradictions
 * Contradiction events for the continuity dashboard
 */
router.get('/contradictions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const contradictions = await continuityAnalysisService.getContradictions(req.user!.id);
    res.json({ contradictions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get continuity contradictions');
    res.status(500).json({ error: 'Failed to get continuity contradictions' });
  }
});

/**
 * POST /api/continuity/run
 * Trigger full continuity analysis (contradictions, goals, arc shifts, etc.)
 */
router.post('/run', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await continuityAnalysisService.runContinuityAnalysis(req.user!.id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ err: error }, 'Failed to run continuity analysis');
    res.status(500).json({ error: 'Failed to run continuity analysis' });
  }
});

/**
 * GET /api/continuity/events/:id
 * Get event explanation with related context
 */
router.get('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const explanation = await explainabilityContinuityService.explainEvent(id, req.user!.id);

    if (!explanation) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(explanation);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get event explanation');
    res.status(500).json({ error: 'Failed to get event explanation' });
  }
});

/**
 * POST /api/continuity/events/:id/revert
 * Revert a reversible event
 */
router.post('/events/:id/revert', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const reversalLog = await explainabilityContinuityService.revertEvent(
      req.user!.id,
      id,
      reason
    );

    if (!reversalLog) {
      return res.status(400).json({ error: 'Event cannot be reverted' });
    }

    res.json({ reversal: reversalLog, success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to revert event');
    res.status(500).json({ error: 'Failed to revert event' });
  }
});

/**
 * GET /api/continuity/events/:id/reversal
 * Get reversal log for an event
 */
router.get('/events/:id/reversal', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const reversalLog = await explainabilityContinuityService.getReversalLog(id, req.user!.id);

    if (!reversalLog) {
      return res.status(404).json({ error: 'Reversal log not found' });
    }

    res.json({ reversal: reversalLog });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reversal log');
    res.status(500).json({ error: 'Failed to get reversal log' });
  }
});

export const continuityRouter = router;
