import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';

const router = Router();

const journalSchema = z.object({
  text: z.string().min(1),
  tags: z.array(z.string()).default([]),
  characters: z.array(z.string()).default([]),
  mood: z.number().min(-5).max(5).default(0),
  arcId: z.string().nullable().optional(),
  fabricLinks: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  timestamp: z.string().optional()
});

router.post('/create', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const payload = parsed.data;
  const entry = await memoryService.saveEntry({
    userId: req.user!.id,
    content: payload.text,
    tags: payload.tags,
    date: payload.timestamp,
    metadata: {
      characters: payload.characters,
      arcId: payload.arcId,
      fabricLinks: payload.fabricLinks,
      references: payload.references,
      mood: payload.mood
    }
  });

  res.status(201).json({ entry });
});

const autosaveBuffer = new Map<string, { text: string; updatedAt: string }>();

router.post('/autosave', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = journalSchema.pick({ text: true, tags: true, characters: true, mood: true, arcId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  autosaveBuffer.set(req.user!.id, { text: parsed.data.text, updatedAt: new Date().toISOString() });
  res.json({ status: 'ok', updatedAt: autosaveBuffer.get(req.user!.id)?.updatedAt });
});

export const journalRouter = router;
