import { Router } from 'express';
import { logger } from '../logger';
import { SocialProjectionEngine } from '../services/socialProjection';
import { ProjectionStorage } from '../services/socialProjection/projectionStorage';

const router = Router();
const engine = new SocialProjectionEngine();
const storage = new ProjectionStorage();

/**
 * POST /api/social-projection/analyze
 * Analyze social projections from journal entries
 */
router.post('/analyze', async (req, res) => {
  try {
    const { entries, user, crushId, gymId, groupId } = req.body;

    if (!entries || !user || !user.id) {
      return res.status(400).json({ error: 'Missing entries or user' });
    }

    const result = await engine.process({
      entries,
      user,
      crushId,
      gymId,
      groupId,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error analyzing social projections');
    res.status(500).json({ error: 'Failed to analyze social projections' });
  }
});

/**
 * GET /api/social-projection
 * Get social projections for user
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const projections = await storage.getProjections(userId, limit);
    const links = await storage.getLinks(userId);

    res.json({ projections, links });
  } catch (error) {
    logger.error({ error }, 'Error fetching social projections');
    res.status(500).json({ error: 'Failed to fetch social projections' });
  }
});

export default router;

