/**
 * LORE-KEEPER EXPLAINABILITY & META CONTINUITY LAYER
 * API Routes
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { continuityService } from '../services/continuityService';
import { logger } from '../logger';

const router = Router();

/**
 * GET /api/continuity/events
 * List continuity events with optional filters
 */
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      type,
      severity,
      reversible,
      start_date,
      end_date,
      limit,
      offset,
    } = req.query;

    const filters: any = {};
    if (type) filters.type = type;
    if (severity) filters.severity = severity;
    if (reversible !== undefined) filters.reversible = reversible === 'true';
    if (start_date) filters.start_date = start_date as string;
    if (end_date) filters.end_date = end_date as string;
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (offset) filters.offset = parseInt(offset as string, 10);

    const events = await continuityService.listEvents(req.user!.id, filters);

    res.json({ events });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list continuity events');
    res.status(500).json({ error: 'Failed to list continuity events' });
  }
});

/**
 * GET /api/continuity/events/:id
 * Get event explanation with related context
 */
router.get('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const explanation = await continuityService.explainEvent(id, req.user!.id);

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

    const reversalLog = await continuityService.revertEvent(
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
    const reversalLog = await continuityService.getReversalLog(id, req.user!.id);

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
