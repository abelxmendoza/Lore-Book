import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { MemoryConsolidationEngine } from '../services/consolidation/consolidationEngine';

const router = Router();
const consolidationEngine = new MemoryConsolidationEngine();

/**
 * GET /api/consolidation/candidates
 * Find consolidation candidates
 */
router.get(
  '/candidates',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const entryIds = req.query.entryIds
      ? (req.query.entryIds as string).split(',')
      : undefined;

    const payload = await consolidationEngine.findCandidates(userId, entryIds);

    res.json(payload);
  })
);

/**
 * POST /api/consolidation/consolidate
 * Consolidate entries
 */
router.post(
  '/consolidate',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const candidate = req.body.candidate;

    if (!candidate || !candidate.entries || candidate.entries.length < 2) {
      return res.status(400).json({
        error: 'Invalid candidate: must have at least 2 entries',
      });
    }

    logger.info({ userId, candidate }, 'Consolidating entries');

    const result = await consolidationEngine.consolidate(userId, candidate);

    if (!result.success) {
      return res.status(500).json({
        error: result.error || 'Failed to consolidate entries',
      });
    }

    res.json(result);
  })
);

/**
 * GET /api/consolidation/stats
 * Get consolidation statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await consolidationEngine.getStats(userId);

    res.json(stats);
  })
);

export default router;

