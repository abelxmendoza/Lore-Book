import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const timeline = await memoryService.getTimeline(req.user!.id);
  res.json({ timeline });
});

router.get('/tags', requireAuth, async (req: AuthenticatedRequest, res) => {
  const tags = await memoryService.listTags(req.user!.id);
  res.json({ tags });
});

export const timelineRouter = router;
