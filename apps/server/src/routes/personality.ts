import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import { PersonalityEngine } from '../services/personality/personalityEngine';
import { PersonalityStorage } from '../services/personality/personalityStorage';

const router = Router();
const personalityEngine = new PersonalityEngine();
const personalityStorage = new PersonalityStorage();

/**
 * POST /api/personality/analyze
 * Process and analyze personality
 */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const save = req.body.save !== false;

    logger.info({ userId, save }, 'Analyzing personality');

    const result = await personalityEngine.process(userId);

    if (save) {
      await personalityStorage.saveTraits(result.profile.traits);
      await personalityStorage.saveInsights(result.insights || []);
    }

    res.json(result);
  })
);

/**
 * GET /api/personality/profile
 * Get personality profile
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const traits = await personalityStorage.getTraits(userId);

    const dominantTraits = traits
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map(t => t.trait);

    res.json({
      profile: {
        user_id: userId,
        traits,
        dominant_traits: dominantTraits,
      },
    });
  })
);

export default router;

