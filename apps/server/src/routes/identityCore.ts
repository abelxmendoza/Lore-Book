import { Router } from 'express';
import { logger } from '../logger';
import { IdentityCoreEngine } from '../services/identityCore';
import { IdentityStorage } from '../services/identityCore/identityStorage';

const router = Router();
const engine = new IdentityCoreEngine();
const storage = new IdentityStorage();

/**
 * POST /api/identity-core/analyze
 * Analyze identity core from journal entries
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
    logger.error({ error }, 'Error analyzing identity core');
    res.status(500).json({ error: 'Failed to analyze identity core' });
  }
});

/**
 * GET /api/identity-core/profiles
 * Get identity core profiles for user
 */
router.get('/profiles', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const profiles = await storage.getProfiles(userId);

    res.json({ profiles });
  } catch (error) {
    logger.error({ error }, 'Error fetching identity core profiles');
    res.status(500).json({ error: 'Failed to fetch identity core profiles' });
  }
});

/**
 * GET /api/identity-core/signals
 * Get identity signals for user
 */
router.get('/signals', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const signals = await storage.getSignals(userId, limit);

    res.json({ signals });
  } catch (error) {
    logger.error({ error }, 'Error fetching identity signals');
    res.status(500).json({ error: 'Failed to fetch identity signals' });
  }
});

export default router;

