import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { harmonizationService } from './harmonization.service';

const router = Router();

router.get('/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const summary = await harmonizationService.compute(req.user!.id);
  res.json(summary);
});

export const harmonizationRouter = router;
