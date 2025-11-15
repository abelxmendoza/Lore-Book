import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chatService } from '../services/chatService';
import { memoryService } from '../services/memoryService';

const router = Router();

const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  tags: z.array(z.string()).optional()
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const entries = await memoryService.searchEntries(req.user!.id, {
    from: parsed.data.from,
    to: parsed.data.to,
    tag: parsed.data.tags?.[0]
  });

  const summary = await chatService.summarizeEntries(req.user!.id, entries);
  res.json({ summary, entryCount: entries.length });
});

export const summaryRouter = router;
