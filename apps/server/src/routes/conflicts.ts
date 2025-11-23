import { Router } from 'express';
import { logger } from '../logger';
import { ConflictResolver } from '../services/conflict/conflictResolver';
import { ConflictStorage } from '../services/conflict/storageService';

const router = Router();
const resolver = new ConflictResolver();
const storage = new ConflictStorage();

/**
 * POST /api/conflicts/resolve
 * Resolve conflicts from journal entries
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
    logger.error({ error }, 'Error resolving conflicts');
    res.status(500).json({ error: 'Failed to resolve conflicts' });
  }
});

/**
 * GET /api/conflicts
 * Get conflicts for user
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const conflicts = await storage.getConflicts(userId, limit);

    res.json({ conflicts });
  } catch (error) {
    logger.error({ error }, 'Error fetching conflicts');
    res.status(500).json({ error: 'Failed to fetch conflicts' });
  }
});

/**
 * GET /api/conflicts/:id
 * Get a single conflict by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conflict = await storage.getConflict(req.params.id);

    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }

    // Verify ownership
    if (conflict.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ conflict });
  } catch (error) {
    logger.error({ error }, 'Error fetching conflict');
    res.status(500).json({ error: 'Failed to fetch conflict' });
  }
});

export default router;

