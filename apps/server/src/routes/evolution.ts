import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { evolutionService } from '../services/evolutionService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const insights = await evolutionService.analyze(req.user!.id);
    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Error analyzing evolution');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to analyze evolution' });
  }
});

export const evolutionRouter = router;
