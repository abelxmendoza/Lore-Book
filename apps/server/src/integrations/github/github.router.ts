import { Router } from 'express';

import { logger } from '../../logger';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth';

import { githubIntegrationService } from './github.service';

const router = Router();

router.get('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await githubIntegrationService.sync(req.user!.id);
  res.json(result);
});

router.post('/webhook', async (req, res) => {
  const userId = (req.query.userId as string) || 'anonymous';
  try {
    const result = await githubIntegrationService.handleWebhook(userId, req.body);
    res.status(201).json(result);
  } catch (error: any) {
    logger.error({ error }, 'Failed to ingest GitHub webhook');
    res.status(500).json({ error: 'Failed to ingest GitHub webhook' });
  }
});

router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const distilled = await githubIntegrationService.getDistilled(req.user!.id);
  res.json({ events: distilled });
});

router.post('/refresh', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await githubIntegrationService.refresh(req.user!.id);
  res.json(result);
});

export const githubRouter = router;
