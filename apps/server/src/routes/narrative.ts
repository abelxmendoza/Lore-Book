import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { NarrativeEngine } from '../services/narrative/narrativeEngine';

const router = Router();
const narrativeEngine = new NarrativeEngine();

/**
 * POST /api/narrative/build
 * Build a narrative from entries
 */
router.post(
  '/build',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { entryIds, type, style, save } = req.body;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return res.status(400).json({
        error: 'entryIds array is required and must not be empty',
      });
    }

    logger.info({ userId, entryIds: entryIds.length, type, style }, 'Building narrative');

    const narrative = await narrativeEngine.buildNarrative(
      userId,
      entryIds,
      type,
      style,
      save !== false
    );

    if (!narrative) {
      return res.status(500).json({
        error: 'Failed to build narrative',
      });
    }

    res.json(narrative);
  })
);

/**
 * GET /api/narrative/:id
 * Get narrative by ID
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const narrativeId = req.params.id;

    const narrative = await narrativeEngine.getNarrative(narrativeId, userId);

    if (!narrative) {
      return res.status(404).json({
        error: 'Narrative not found',
      });
    }

    res.json(narrative);
  })
);

/**
 * GET /api/narrative
 * Query narratives
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const query = {
      start_date: req.query.startDate as string | undefined,
      end_date: req.query.endDate as string | undefined,
      type: req.query.type as any,
      theme: req.query.theme as string | undefined,
      character: req.query.character as string | undefined,
      min_entries: req.query.minEntries ? parseInt(req.query.minEntries as string) : undefined,
      max_entries: req.query.maxEntries ? parseInt(req.query.maxEntries as string) : undefined,
    };

    const narratives = await narrativeEngine.queryNarratives(userId, query);

    res.json({ narratives });
  })
);

/**
 * POST /api/narrative/:id/status
 * Update narrative status
 */
router.post(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const narrativeId = req.params.id;
    const status = req.body.status;

    if (!status || !['draft', 'complete', 'archived'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: draft, complete, archived',
      });
    }

    logger.info({ userId, narrativeId, status }, 'Updating narrative status');

    const success = await narrativeEngine.updateStatus(narrativeId, status);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to update narrative status',
      });
    }

    res.json({ success: true });
  })
);

/**
 * GET /api/narrative/stats
 * Get narrative statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await narrativeEngine.getStats(userId);

    res.json(stats);
  })
);

export default router;

