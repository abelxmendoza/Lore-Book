import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { memoryService } from '../services/memoryService';
import { ShadowEngine } from '../services/shadowEngine';
import { getShadowProfile } from '../services/shadowEngine/shadowStorage';

const router = Router();
const engine = new ShadowEngine();

/**
 * POST /api/shadow/analyze
 * Analyze shadow patterns from journal entries
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing shadow patterns');

    // Fetch user's entries
    const entries = await memoryService.searchEntries(userId, {
      limit: 1000, // Get a good sample
    });

    const profile = await engine.process(userId, entries, save);

    res.json(profile);
  })
);

/**
 * GET /api/shadow/profile
 * Get user's shadow profile
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const profile = await getShadowProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Shadow profile not found' });
    }

    res.json(profile);
  })
);

export default router;

