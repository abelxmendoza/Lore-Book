import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { TemporalEventResolver } from '../services/temporalEvents/eventResolver';
import { EventStorage } from '../services/temporalEvents/storageService';

const router = Router();
const resolver = new TemporalEventResolver();
const storage = new EventStorage();

/**
 * POST /api/temporal-events/resolve
 * Resolve temporal events from journal entries
 */
router.post(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const context = {
      entries: req.body.entries || req.body.context?.entries || [],
      user: { id: userId },
      entities: req.body.entities || req.body.context?.entities || [],
      locations: req.body.locations || req.body.context?.locations || [],
      activities: req.body.activities || req.body.context?.activities || [],
    };

    logger.info(
      {
        userId,
        entries: context.entries.length,
        entities: context.entities.length,
        locations: context.locations.length,
        activities: context.activities.length,
      },
      'Resolving temporal events'
    );

    const resolved = await resolver.process(context);

    res.json({ events: resolved });
  })
);

/**
 * GET /api/temporal-events
 * Get all resolved events for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    logger.info({ userId, type, startDate, endDate }, 'Getting temporal events');

    let events = await storage.loadAll(userId);

    // Filter by type
    if (type) {
      events = events.filter(e => e.type === type);
    }

    // Filter by date range
    if (startDate || endDate) {
      events = events.filter(e => {
        const eventTime = new Date(e.startTime).getTime();
        if (startDate && eventTime < new Date(startDate).getTime()) return false;
        if (endDate && eventTime > new Date(endDate).getTime()) return false;
        return true;
      });
    }

    res.json({ events });
  })
);

/**
 * GET /api/temporal-events/:id
 * Get specific resolved event
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

