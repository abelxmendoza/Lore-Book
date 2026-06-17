import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { evolutionService } from '../services/evolutionService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const { insights, timing } = await evolutionService.analyze(req.user!.id, { refresh });

    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('X-Evolution-Timing-Ms', String(timing.totalMs));
      res.setHeader('X-Evolution-Db-Ms', String(timing.dbMs));
      res.setHeader('X-Evolution-Openai-Ms', String(timing.openaiMs));
      res.setHeader('X-Evolution-Cache-Hit', timing.cacheHit ? '1' : '0');
    }

    if (timing.openaiMs > 3000) {
      logger.info({ userId: req.user!.id, timing }, 'Slow evolution analyze');
    }

    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Error analyzing evolution');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to analyze evolution' });
  }
});

export const evolutionRouter = router;
