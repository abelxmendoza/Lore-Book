import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { achievementService } from '../services/achievements/achievementService';
import { logger } from '../logger';

const router = Router();

/**
 * Get all achievements for user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;
    const rarity = req.query.rarity as string | undefined;

    const achievements = await achievementService.getAchievements(userId, {
      type: type as any,
      rarity: rarity as any
    });

    res.json({ achievements });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get achievements');
    res.status(500).json({ error: 'Failed to get achievements' });
  }
});

/**
 * Get achievement templates
 */
router.get('/templates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const templates = await achievementService.getTemplates();
    res.json({ templates });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get achievement templates');
    res.status(500).json({ error: 'Failed to get achievement templates' });
  }
});

/**
 * Check and unlock achievements
 */
router.post('/check', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const unlocked = await achievementService.checkAchievements(userId);
    res.json({ unlocked, count: unlocked.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to check achievements');
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

/**
 * Get achievement statistics
 */
router.get('/statistics', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const stats = await achievementService.getStatistics(userId);
    res.json({ statistics: stats });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get achievement statistics');
    res.status(500).json({ error: 'Failed to get achievement statistics' });
  }
});

export default router;
