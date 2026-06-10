import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { locationService } from '../services/locationService';
import { logger } from '../logger';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const locations = await locationService.listLocations(req.user!.id);
  res.json({ locations });
});

// GET /api/locations/:id/facts
// Returns entity facts for this location extracted from conversations.
router.get('/:id/facts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const locationId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const facts = await entityFactsService.getEntityFacts(userId, locationId, 'location');
    res.json({ success: true, facts });
  } catch (error) {
    logger.error({ error, locationId }, 'Failed to get location facts');
    res.status(500).json({ error: 'Failed to get location facts' });
  }
});

export const locationsRouter = router;
