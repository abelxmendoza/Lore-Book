import { Router } from 'express';
import { logger } from '../logger';
import { BehaviorResolver } from '../services/behavior/behaviorResolver';
import { BehaviorStorage } from '../services/behavior/storageService';

const router = Router();
const resolver = new BehaviorResolver();
const storage = new BehaviorStorage();

/**
 * POST /api/behavior/resolve
 * Resolve behaviors from journal entries
 */
router.post('/resolve', async (req, res) => {
  try {
    const { entries, user } = req.body;

    if (!entries || !user || !user.id) {
      return res.status(400).json({ error: 'Missing entries or user' });
    }

    const result = await resolver.process({ entries, user });

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error resolving behaviors');
    res.status(500).json({ error: 'Failed to resolve behaviors' });
  }
});

/**
 * GET /api/behavior/events
 * Get behavior events for user
 */
router.get('/events', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const events = await storage.getBehaviors(userId, limit);

    res.json({ events });
  } catch (error) {
    logger.error({ error }, 'Error fetching behavior events');
    res.status(500).json({ error: 'Failed to fetch behavior events' });
  }
});

/**
 * GET /api/behavior/loops
 * Get behavior loops for user
 */
router.get('/loops', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const loops = await storage.getLoops(userId);

    res.json({ loops });
  } catch (error) {
    logger.error({ error }, 'Error fetching behavior loops');
    res.status(500).json({ error: 'Failed to fetch behavior loops' });
  }
});

export default router;

