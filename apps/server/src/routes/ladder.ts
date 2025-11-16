import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { ladderService } from '../services/ladderService';

const router = Router();

const ladderQuerySchema = z.object({
  from: z.string().optional()
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = ladderQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const ladder = await ladderService.buildLadder(req.user!.id, parsed.data.from);
  res.json({ ladder });
});

export const ladderRouter = router;
