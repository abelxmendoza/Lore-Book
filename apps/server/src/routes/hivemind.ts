/**
 * /api/hivemind — the Hivemind cross-agent workspace inside LoreBook.
 *
 * Every route requires a signed-in account AND Hivemind access
 * (lib/hivemindAccess.ts: founder-only by default, opened with
 * HIVEMIND_ACCESS or a per-account app_metadata.hivemind_access grant).
 * The same data is exposed to AI agents through the hivemind_* MCP tools.
 */

import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';

import { isDevelopmentRuntime } from '../config/runtimePolicy';
import { resolveAccountAuthority } from '../lib/accountAuthority';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
  addMilestone,
  agentHivemindStateSchema,
  checkpointInputSchema,
  deleteCheckpoint,
  deleteMemory,
  getHivemindOverview,
  importAgentHivemindState,
  listCheckpoints,
  listMemories,
  listMilestones,
  memoryInputSchema,
  milestoneInputSchema,
  upsertCheckpoint,
  upsertMemory,
} from '../services/hivemind/hivemindService';

export const hivemindRouter = Router();

export async function requireHivemindAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Local dev mirrors requireAdmin: the fixed DISABLE_AUTH_FOR_DEV user has
  // no auth.users row to resolve a role from. Never applies in production.
  if (isDevelopmentRuntime()) {
    next();
    return;
  }
  try {
    const authority = await resolveAccountAuthority(req.user.id);
    if (!authority.canUseHivemind) {
      res.status(403).json({ error: 'Forbidden', message: 'Hivemind is not enabled for this account' });
      return;
    }
    next();
  } catch (error) {
    logger.error({ error, userId: req.user.id }, 'Failed to resolve Hivemind access');
    res.status(500).json({ error: 'Failed to verify access' });
  }
}

hivemindRouter.use(requireAuth, requireHivemindAccess);

const idParam = z.string().uuid();
const limitQuery = z.coerce.number().int().min(1).max(200).optional();

function handle(
  action: string,
  fn: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', issues: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.id }, `Hivemind ${action} failed`);
      res.status(500).json({ error: `Failed to ${action}` });
    }
  };
}

hivemindRouter.get('/', handle('load hivemind', async (req, res) => {
  res.json(await getHivemindOverview(req.user!.id));
}));

hivemindRouter.get('/checkpoints', handle('list checkpoints', async (req, res) => {
  const limit = limitQuery.parse(req.query.limit);
  res.json({ checkpoints: await listCheckpoints(req.user!.id, limit) });
}));

hivemindRouter.put('/checkpoints', handle('save checkpoint', async (req, res) => {
  const input = checkpointInputSchema.parse(req.body);
  res.json({ checkpoint: await upsertCheckpoint(req.user!.id, input) });
}));

hivemindRouter.delete('/checkpoints/:id', handle('delete checkpoint', async (req, res) => {
  const deleted = await deleteCheckpoint(req.user!.id, idParam.parse(req.params.id));
  res.status(deleted ? 200 : 404).json({ deleted });
}));

hivemindRouter.get('/memories', handle('list memories', async (req, res) => {
  const query = z.string().max(200).optional().parse(req.query.q);
  const project = z.string().max(120).optional().parse(req.query.project);
  const limit = limitQuery.parse(req.query.limit);
  res.json({ memories: await listMemories(req.user!.id, { query, project, limit }) });
}));

hivemindRouter.post('/memories', handle('save memory', async (req, res) => {
  const input = memoryInputSchema.parse(req.body);
  res.json({ memory: await upsertMemory(req.user!.id, input) });
}));

hivemindRouter.delete('/memories/:id', handle('delete memory', async (req, res) => {
  const deleted = await deleteMemory(req.user!.id, idParam.parse(req.params.id));
  res.status(deleted ? 200 : 404).json({ deleted });
}));

hivemindRouter.get('/milestones', handle('list milestones', async (req, res) => {
  const limit = limitQuery.parse(req.query.limit);
  res.json({ milestones: await listMilestones(req.user!.id, limit) });
}));

hivemindRouter.post('/milestones', handle('save milestone', async (req, res) => {
  const input = milestoneInputSchema.parse(req.body);
  res.status(201).json({ milestone: await addMilestone(req.user!.id, input) });
}));

/** One-click import of the local agent-hivemind state file (hivemind_state.json). */
hivemindRouter.post('/import', handle('import hivemind state', async (req, res) => {
  const state = agentHivemindStateSchema.parse(req.body);
  res.json(await importAgentHivemindState(req.user!.id, state));
}));
