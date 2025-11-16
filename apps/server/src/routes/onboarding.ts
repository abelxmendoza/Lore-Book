import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { onboardingService } from '../services/onboardingService';

const router = Router();

const importSchema = z.object({
  files: z.array(z.object({ name: z.string(), content: z.string().optional() })).optional(),
  calendar: z.boolean().optional(),
  photos: z.boolean().optional()
});

router.post('/init', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await onboardingService.initialize(req.user!.id);
  res.status(201).json(result);
});

router.post('/import', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const result = await onboardingService.importMemories(req.user!.id, parsed.data);
  res.status(201).json(result);
});

router.get('/briefing', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await onboardingService.generateBriefing(req.user!.id);
  res.json(result);
});

export const onboardingRouter = router;
