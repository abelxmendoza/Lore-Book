import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { EmotionResolver } from '../services/emotion/emotionResolver';
import { EmotionStorage } from '../services/emotion/storageService';

const router = Router();
const resolver = new EmotionResolver();
const storage = new EmotionStorage();

/**
 * POST /api/emotion/resolve
 * Resolve emotions from journal entries
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

    logger.info({ userId, entries: context.entries.length }, 'Resolving emotions');

    const resolved = await resolver.process(context);

    res.json({ emotions: resolved });
  })
);

/**
 * GET /api/emotion/events
 * Get all emotion events for user
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const emotion = req.query.emotion as string | undefined;
    const polarity = req.query.polarity as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    logger.info({ userId, emotion, polarity, startDate, endDate }, 'Getting emotion events');

    let events = await storage.loadAll(userId);

    // Filter by emotion
    if (emotion) {
      events = events.filter(e => e.emotion === emotion);
    }

    // Filter by polarity
    if (polarity) {
      events = events.filter(e => e.polarity === polarity);
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
 * GET /api/emotion/events/:id
 * Get specific emotion event
 */
router.get(
  '/events/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const events = await storage.loadAll(userId);
    const event = events.find(e => e.id === id);

    if (!event) {
      return res.status(404).json({ error: 'Emotion event not found' });
    }

    res.json({ event });
  })
);

export default router;

