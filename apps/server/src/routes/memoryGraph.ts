import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitDelta } from '../realtime/orchestratorEmitter';
import { memoryGraphService } from '../services/memoryGraphService';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const graph = await memoryGraphService.buildGraph(req.user!.id);
  res.json({ graph });
});

router.post('/link', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    source: z.string(),
    target: z.string(),
    type: z.string().default('co_occurrence'),
    weight: z.number().optional(),
    context: z.record(z.any()).optional(),
    firstSeen: z.string().optional(),
    lastSeen: z.string().optional()
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const now = new Date().toISOString();
  const edge = {
    source: parsed.data.source,
    target: parsed.data.target,
    type: parsed.data.type,
    weight: parsed.data.weight ?? 1,
    firstSeen: parsed.data.firstSeen ?? now,
    lastSeen: parsed.data.lastSeen ?? now,
    recency: 1,
    context: parsed.data.context ?? {},
  };

  void emitDelta('fabric.link_add', { edge }, req.user!.id);
  res.status(201).json({ edge });
});

export const memoryGraphRouter = router;
