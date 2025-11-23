import { Router } from 'express';
import { logger } from '../logger';
import { SceneResolver } from '../services/scenes/sceneResolver';
import { SceneStorage } from '../services/scenes/storageService';

const router = Router();
const resolver = new SceneResolver();
const storage = new SceneStorage();

/**
 * POST /api/scenes/resolve
 * Resolve scenes from journal entries
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
    logger.error({ error }, 'Error resolving scenes');
    res.status(500).json({ error: 'Failed to resolve scenes' });
  }
});

/**
 * GET /api/scenes
 * Get scenes for user
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const scenes = await storage.getScenes(userId, limit);

    res.json({ scenes });
  } catch (error) {
    logger.error({ error }, 'Error fetching scenes');
    res.status(500).json({ error: 'Failed to fetch scenes' });
  }
});

/**
 * GET /api/scenes/:id
 * Get a single scene by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const scene = await storage.getScene(req.params.id);

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Verify ownership
    if (scene.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ scene });
  } catch (error) {
    logger.error({ error }, 'Error fetching scene');
    res.status(500).json({ error: 'Failed to fetch scene' });
  }
});

export default router;

