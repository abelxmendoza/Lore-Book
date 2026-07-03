import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../../logger';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth';

import { xConnectionService } from './xConnection.service';

export const xIntegrationRouter = Router();
export const xIntegrationCallbackRouter = Router();

const beginSchema = z.object({
  returnTo: z.string().optional(),
});

const syncSchema = z.object({
  maxPosts: z.number().min(5).max(100).optional(),
});

function accountErrorRedirect() {
  return `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/account?x=error`;
}

xIntegrationRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await xConnectionService.status(req.user!.id);
    return res.json(status);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to load X connection status' });
  }
});

xIntegrationRouter.post('/begin', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = beginSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    return res.json(xConnectionService.begin(req.user!.id, req, parsed.data.returnTo ?? '/account'));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to start X OAuth' });
  }
});

xIntegrationRouter.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = syncSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const result = await xConnectionService.sync(req.user!.id, parsed.data.maxPosts ?? 25);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to sync X posts' });
  }
});

xIntegrationRouter.delete('/connection', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await xConnectionService.disconnect(req.user!.id);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to disconnect X' });
  }
});

xIntegrationCallbackRouter.get('/', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';

  if (error) {
    logger.warn({ error, description: req.query.error_description }, 'X OAuth returned error');
    return res.redirect(accountErrorRedirect());
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing X OAuth code or state' });
  }

  try {
    const result = await xConnectionService.complete(code, state, req);
    return res.redirect(result.redirectTo);
  } catch (err: any) {
    logger.error({ err }, 'Failed to complete X OAuth');
    return res.redirect(accountErrorRedirect());
  }
});
