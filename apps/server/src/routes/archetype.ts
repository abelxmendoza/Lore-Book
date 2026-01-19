import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ArchetypeEngine } from '../services/archetype/archetypeEngine';
import { ArchetypeStorage } from '../services/archetype/archetypeStorage';

const router = Router();
const archetypeEngine = new ArchetypeEngine();
const archetypeStorage = new ArchetypeStorage();

/**
 * POST /api/archetype/analyze
 * Process and analyze archetypes
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing archetypes');

    const result = await archetypeEngine.process(userId);

    if (save) {
      await archetypeStorage.saveSignals(result.signals);
      await archetypeStorage.saveProfile(result.profile);
      await archetypeStorage.saveTransitions(result.transitions);
      await archetypeStorage.saveDistortions(result.distortions);
    }

    res.json(result);
  })
);

/**
 * GET /api/archetype/profile
 * Get archetype profile
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const profile = await archetypeStorage.getProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Archetype profile not found' });
    }

    res.json({ profile });
  })
);

export default router;

