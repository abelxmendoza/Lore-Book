import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { getTimeline } from '../controllers/timelineController';
import { memoryService } from '../services/memoryService';
import { taskTimelineService } from '../services/taskTimelineService';
import { emitDelta } from '../realtime/orchestratorEmitter';

const router = Router();

router.get('/', requireAuth, getTimeline);

router.get('/tags', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tags = await memoryService.listTags(req.user!.id);
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch tags' });
  }
});

router.post('/append', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    occurredAt: z.string().optional(),
    taskId: z.string().optional(),
    context: z.record(z.any()).optional()
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const event = await taskTimelineService.createEvent(req.user!.id, parsed.data);
    void emitDelta('timeline.add', { event }, req.user!.id);
    res.status(201).json({ event });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to append timeline event' });
  }
});

export const timelineRouter = router;
