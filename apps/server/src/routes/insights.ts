import { Router } from 'express';
import { spawn } from 'node:child_process';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';

const router = Router();

const predictSchema = z.object({
  timeline: z.array(z.any()).optional(),
  arcs: z.array(z.any()).optional(),
  identity: z.array(z.any()).optional(),
  tasks: z.array(z.any()).optional(),
  characters: z.array(z.any()).optional(),
  locations: z.array(z.any()).optional()
});

const runInsightEngine = async (payload: Record<string, unknown>) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const proc = spawn('python', ['-m', 'lorekeeper.insight_engine']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error({ stderr }, 'Insight engine failed');
        reject(new Error(stderr || `Insight engine exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });

const buildPayload = async (userId: string, range?: { from?: string; to?: string }) => {
  const [timeline, arcs] = await Promise.all([
    memoryService.searchEntries(userId, { limit: 200, from: range?.from, to: range?.to }),
    chapterService.listChapters(userId)
  ]);

  return { timeline, arcs, identity: [], tasks: [], characters: [], locations: [] } satisfies Record<string, unknown>;
};

router.get('/recent', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await buildPayload(req.user!.id);
    const insights = await runInsightEngine(payload);
    res.json({ insights });
  } catch (error: any) {
    logger.error({ error }, 'Failed to build recent insights');
    // Return empty insights instead of error - insights are optional
    res.json({ insights: null });
  }
});

router.get('/monthly/:year/:month', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { year, month } = req.params;
    const start = new Date(Number(year), Number(month) - 1, 1).toISOString();
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59).toISOString();
    const payload = await buildPayload(req.user!.id, { from: start, to: end });
    const insights = await runInsightEngine(payload);
    res.json({ insights });
  } catch (error: any) {
    logger.error({ error }, 'Failed to build monthly insights');
    res.status(500).json({ error: error.message ?? 'Failed to build insights' });
  }
});

router.get('/yearly/:year', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { year } = req.params;
    const start = new Date(Number(year), 0, 1).toISOString();
    const end = new Date(Number(year), 11, 31, 23, 59, 59).toISOString();
    const payload = await buildPayload(req.user!.id, { from: start, to: end });
    const insights = await runInsightEngine(payload);
    res.json({ insights });
  } catch (error: any) {
    logger.error({ error }, 'Failed to build yearly insights');
    res.status(500).json({ error: error.message ?? 'Failed to build insights' });
  }
});

router.post('/predict', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = predictSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const payload = parsed.data.timeline
      ? parsed.data
      : await buildPayload(req.user!.id);
    const insights = await runInsightEngine(payload as Record<string, unknown>);
    res.json({ insights });
  } catch (error: any) {
    logger.error({ error }, 'Failed to generate prediction insights');
    res.status(500).json({ error: error.message ?? 'Failed to predict arcs' });
  }
});

export const insightsRouter = router;
