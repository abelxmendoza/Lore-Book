import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { xService } from '../services/xService';

const router = Router();

const syncSchema = z.object({
  handle: z.string().min(1),
  maxPosts: z.number().min(1).max(100).optional(),
  sinceId: z.string().optional(),
  includeReplies: z.boolean().optional()
});

router.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const result = await xService.syncPosts(req.user!.id, parsed.data);
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ error }, 'Failed to sync X posts');
    return res.status(500).json({ error: error.message ?? 'Failed to sync X posts' });
  }
});

export const xRouter = router;
