import { Router } from 'express';
import { z } from 'zod';

import { externalHubService } from './external_hub.service';
import { ExternalSource } from './types';

const router = Router();

const sourceParamSchema = z.object({
  source: z.enum(['github', 'instagram', 'x', 'calendar', 'photos']),
});

router.post('/:source/ingest', async (req, res) => {
  const parsed = sourceParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const source = parsed.data.source as ExternalSource;

  try {
    const entries = await externalHubService.ingest(source, req.body ?? {});
    return res.status(201).json({ entries });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to ingest external source' });
  }
});

router.get('/status', (_req, res) => {
  return res.json(externalHubService.getStatus());
});

export const externalHubRouter = router;
