import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryLadderRenderer } from '../services/memoryLadderRenderer';

const router = Router();

const memoryLadderQuery = z.object({
  interval: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
  persona: z.string().optional(),
  tag: z.string().optional(),
  emotion: z.string().optional()
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = memoryLadderQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const ladder = await memoryLadderRenderer.render(req.user!.id, parsed.data);
  res.json({ ladder });
});

export const memoryLadderRouter = router;
