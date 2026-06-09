import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { timelineService } from '../services/timelineV2';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  timeline_type: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

const patchSchema = createSchema.partial();

// GET / — list all timelines for user
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timelines = await timelineService.listTimelines(req.user!.id);
    res.json({ success: true, timelines });
  })
);

// POST / — create timeline
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    const timeline = await timelineService.createTimeline(req.user!.id, result.data);
    res.status(201).json({ success: true, timeline });
  })
);

// GET /:id — get timeline hierarchy
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const timeline = await timelineService.getTimelineHierarchy(req.user!.id, req.params.id);
    if (!timeline) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, timeline });
  })
);

// PATCH /:id — update timeline
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    }
    const timeline = await timelineService.updateTimeline(req.user!.id, req.params.id, result.data);
    res.json({ success: true, timeline });
  })
);

// DELETE /:id — delete timeline
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await timelineService.deleteTimeline(req.user!.id, req.params.id);
    res.status(204).send();
  })
);

export default router;
