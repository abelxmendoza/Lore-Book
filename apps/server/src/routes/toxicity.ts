import { Router } from 'express';

import { logger } from '../logger';
import { ToxicityResolver } from '../services/toxicity';
import { ToxicityStorage } from '../services/toxicity/toxicityStorage';

const router = Router();
const resolver = new ToxicityResolver();
const storage = new ToxicityStorage();

/**
 * POST /api/toxicity/resolve
 * Resolve toxicity events from journal entries
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
    logger.error({ error }, 'Error resolving toxicity events');
    res.status(500).json({ error: 'Failed to resolve toxicity events' });
  }
});

/**
 * GET /api/toxicity
 * Get toxicity events for user
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const events = await storage.getEvents(userId, limit);

    res.json({ events });
  } catch (error) {
    logger.error({ error }, 'Error fetching toxicity events');
    res.status(500).json({ error: 'Failed to fetch toxicity events' });
  }
});

/**
 * GET /api/toxicity/entity
 * Get toxicity events by entity (person, place, situation)
 */
router.get('/entity', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { entityType, entityName } = req.query;

    if (!entityType || !entityName) {
      return res.status(400).json({ error: 'Missing entityType or entityName' });
    }

    const events = await storage.getEventsByEntity(
      userId,
      entityType as string,
      entityName as string
    );

    res.json({ events });
  } catch (error) {
    logger.error({ error }, 'Error fetching toxicity events by entity');
    res.status(500).json({ error: 'Failed to fetch toxicity events by entity' });
  }
});

/**
 * GET /api/toxicity/:id
 * Get a single toxicity event by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = await storage.getEvent(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Toxicity event not found' });
    }

    // Verify ownership
    if (event.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ event });
  } catch (error) {
    logger.error({ error }, 'Error fetching toxicity event');
    res.status(500).json({ error: 'Failed to fetch toxicity event' });
  }
});

export default router;

