import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { WillStorage } from '../services/will';
import { WillEngine } from '../services/will';
import { memoryService } from '../services/memoryService';

const router = Router();
const willStorage = new WillStorage();

/**
 * GET /api/will/events
 * Get will events for user
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string, 10) : undefined;
    const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    logger.info({ userId, timeWindow, minConfidence, limit }, 'Getting will events');

    const events = await willStorage.getWillEvents(userId, {
      timeWindow,
      minConfidence,
      limit,
    });

    res.json({ will_events: events });
  })
);

/**
 * GET /api/will/agency-metrics
 * Get agency metrics (density, trend, etc.)
 */
router.get(
  '/agency-metrics',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string, 10) : 30;

    logger.info({ userId, timeWindow }, 'Getting agency metrics');

    const metrics = await willStorage.getAgencyMetrics(userId, timeWindow);

    res.json({ metrics });
  })
);

/**
 * POST /api/will/process-entry
 * Manually trigger will processing for a specific entry
 */
router.post(
  '/process-entry',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { entryId } = req.body;

    if (!entryId) {
      return res.status(400).json({ error: 'entryId is required' });
    }

    logger.info({ userId, entryId }, 'Processing will for entry');

    // Get entry
    const entry = await memoryService.getEntry(userId, entryId);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Process with Will Engine
    const engine = new WillEngine();
    const willEvents = await engine.process(
      {
        id: entry.id,
        content: entry.content,
        date: entry.date,
        user_id: userId,
      },
      {
        entry,
        emotion_events: [],
        identity_statements: [],
        past_patterns: [],
        follow_up_entries: [],
      }
    );

    res.json({ will_events: willEvents });
  })
);

export default router;
