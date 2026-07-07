import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../../logger';
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth';

import { xConnectionService, LORE_INTAKE_MODES } from './xConnection.service';

export const xIntegrationRouter = Router();
export const xIntegrationCallbackRouter = Router();

const beginSchema = z.object({
  returnTo: z.string().optional(),
});

const syncSchema = z.object({
  maxPosts: z.number().min(5).max(100).optional(),
});

const settingsSchema = z.object({
  loreIntakeMode: z.enum(LORE_INTAKE_MODES as [string, ...string[]]),
});

const confirmCandidateSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(40),
  provenance: z.object({
    sourceId: z.string().optional(),
    url: z.string().url().optional(),
    postedAt: z.string().optional(),
    excerpt: z.string().max(500).optional(),
  }),
});

function accountErrorRedirect(req?: any) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '') + '/account?x=error';
  if (req?.query?.error_description) {
    const d = encodeURIComponent(String(req.query.error_description).slice(0, 120));
    return `${base}&desc=${d}`;
  }
  return base;
}

xIntegrationRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await xConnectionService.status(req.user!.id);
    return res.json(status);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to load X connection status' });
  }
});

xIntegrationRouter.get('/callback-url', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const info = xConnectionService.getCallbackInfo(req);
    return res.json(info);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to compute callback URL' });
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

xIntegrationRouter.post('/settings', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const result = await xConnectionService.setLoreIntakeMode(
      req.user!.id,
      parsed.data.loreIntakeMode as (typeof LORE_INTAKE_MODES)[number]
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to update X settings' });
  }
});

xIntegrationRouter.post('/lore-candidate/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = confirmCandidateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const { name, type, provenance } = parsed.data;
    const result = await xConnectionService.confirmLoreCandidate(
      req.user!.id,
      { name, type },
      { provider: 'x', ...provenance }
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Failed to add candidate to lore' });
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
    return res.redirect(accountErrorRedirect(req));
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing X OAuth code or state' });
  }

  try {
    const result = await xConnectionService.complete(code, state, req);
    return res.redirect(result.redirectTo);
  } catch (err: any) {
    logger.error({ err }, 'Failed to complete X OAuth');
    return res.redirect(accountErrorRedirect(req));
  }
});
