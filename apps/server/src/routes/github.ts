import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { githubSyncManager } from '../services/github/githubSyncManager';

const router = Router();

router.post('/link', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { repoUrl } = req.body as { repoUrl: string };
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

  try {
    const record = await githubSyncManager.linkRepo(req.user!.id, repoUrl);
    res.json({ repo: record });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to link repo' });
  }
});

router.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { repoUrl } = req.body as { repoUrl: string };
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

  try {
    const result = await githubSyncManager.syncRepo(req.user!.id, repoUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to sync GitHub repo' });
  }
});

router.get('/summaries', requireAuth, async (req: AuthenticatedRequest, res) => {
  const payload = await githubSyncManager.listSummaries(req.user!.id);
  res.json({ summaries: payload });
});

export const githubRouter = router;
