import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { EventResolver } from '../services/events/eventResolver';
import { EventStorage } from '../services/events/storageService';

const router = Router();
const resolver = new EventResolver();
const storage = new EventStorage();

/**
 * POST /api/events/resolve
 * Resolve events from journal entries
 */
router.post(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const context = {
      entries: req.body.entries || req.body.context?.entries || [],
      user: { id: userId },
    };

    logger.info({ userId, entries: context.entries.length }, 'Resolving events');

    const resolved = await resolver.process(context);

    res.json({ events: resolved });
  })
);

/**
 * GET /api/events
 * Get all events for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    logger.info({ userId, startDate, endDate }, 'Getting events');

    let events = await storage.loadAll(userId);

    // Filter by date range if provided
    if (startDate || endDate) {
      events = events.filter(e => {
        if (!e.start_time) return false;
        const eventTime = new Date(e.start_time).getTime();
        if (startDate && eventTime < new Date(startDate).getTime()) return false;
        if (endDate && eventTime > new Date(endDate).getTime()) return false;
        return true;
      });
    }

    res.json({ events });
  })
);

/**
 * GET /api/events/:id
 * Get specific event
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const events = await storage.loadAll(userId);
    const event = events.find(e => e.id === id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ event });
  })
);

export default router;

