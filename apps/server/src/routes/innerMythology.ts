import { Router } from 'express';
import { logger } from '../logger';
import { InnerMythologyEngine } from '../services/innerMythology';
import { MythStorage } from '../services/innerMythology/mythStorage';

const router = Router();
const engine = new InnerMythologyEngine();
const storage = new MythStorage();

/**
 * POST /api/inner-mythology/analyze
 * Analyze inner mythology from journal entries
 */
router.post('/analyze', async (req, res) => {
  try {
    const { entries, user } = req.body;

    if (!entries || !user || !user.id) {
      return res.status(400).json({ error: 'Missing entries or user' });
    }

    const result = await engine.process({ entries, user });

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error analyzing inner mythology');
    res.status(500).json({ error: 'Failed to analyze inner mythology' });
  }
});

/**
 * GET /api/inner-mythology/myths
 * Get inner myths for user
 */
router.get('/myths', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const myths = await storage.getMyths(userId);

    res.json({ myths });
  } catch (error) {
    logger.error({ error }, 'Error fetching inner myths');
    res.status(500).json({ error: 'Failed to fetch inner myths' });
  }
});

/**
 * GET /api/inner-mythology/elements
 * Get myth elements for user
 */
router.get('/elements', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const elements = await storage.getElements(userId, limit);

    res.json({ elements });
  } catch (error) {
    logger.error({ error }, 'Error fetching myth elements');
    res.status(500).json({ error: 'Failed to fetch myth elements' });
  }
});

export default router;

