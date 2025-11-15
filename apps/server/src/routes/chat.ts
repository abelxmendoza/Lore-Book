import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chatService } from '../services/chatService';
import { memoryService } from '../services/memoryService';
import { shouldPersistMessage } from '../utils/keywordDetector';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(2),
  save: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const { answer, relatedEntries } = await chatService.askLoreKeeper(
    req.user!.id,
    parsed.data.message
  );

  const shouldSave = parsed.data.save ?? shouldPersistMessage(parsed.data.message);

  if (shouldSave) {
    await memoryService.saveEntry({
      userId: req.user!.id,
      content: parsed.data.message,
      source: 'chat',
      metadata: parsed.data.metadata
    });
  }

  res.json({ answer, relatedEntries });
});

export const chatRouter = router;
