import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { getTimeline } from '../controllers/timelineController';
import { memoryService } from '../services/memoryService';

const router = Router();

router.get('/', requireAuth, getTimeline);

router.get('/tags', requireAuth, async (req: AuthenticatedRequest, res) => {
  const tags = await memoryService.listTags(req.user!.id);
  res.json({ tags });
});

export const timelineRouter = router;
