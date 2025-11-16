import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { evolutionService } from '../services/evolutionService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const insights = await evolutionService.analyze(req.user!.id);
  res.json({ insights });
});

export const evolutionRouter = router;
