import { Router } from 'express';
import { spawn } from 'node:child_process';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { chapterService } from '../services/chapterService';
import { memoryService } from '../services/memoryService';
import { insightStorageService } from '../services/insightStorageService';

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
    // Get stored insights first
    const storedInsights = await insightStorageService.getRecentInsights(req.user!.id, 20);

    // Also run Python insight engine for fresh insights
  try {
    const payload = await buildPayload(req.user!.id);
      const pythonInsights = await runInsightEngine(payload);
      
      res.json({
        insights: pythonInsights,
        storedInsights,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to run Python insight engine');
      // Return stored insights even if Python engine fails
      res.json({
        insights: null,
        storedInsights,
      });
    }
  } catch (error: any) {
    logger.error({ error }, 'Failed to get recent insights');
    res.json({ insights: null, storedInsights: [] });
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

/**
 * GET /api/insights/stored
 * Get stored insights from database
 */
router.get('/stored', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { type, minConfidence, limit } = req.query;

    let insights;
    if (type) {
      insights = await insightStorageService.getInsightsByType(
        req.user!.id,
        type as any,
        limit ? parseInt(limit as string) : 50
      );
    } else if (minConfidence) {
      insights = await insightStorageService.getHighConfidenceInsights(
        req.user!.id,
        parseFloat(minConfidence as string),
        limit ? parseInt(limit as string) : 50
      );
    } else {
      insights = await insightStorageService.getRecentInsights(
        req.user!.id,
        limit ? parseInt(limit as string) : 20
      );
    }

    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Failed to get stored insights');
    res.status(500).json({
      error: 'Failed to get stored insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/trends
 * Get trend insights
 */
router.get('/trends', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query;

    const insights = await insightStorageService.getTrendInsights(
      req.user!.id,
      from as string | undefined,
      to as string | undefined
    );

    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Failed to get trend insights');
    res.status(500).json({
      error: 'Failed to get trend insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/component/:componentId
 * Get insights for a component
 */
router.get('/component/:componentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { componentId } = req.params;

    const insights = await insightStorageService.getInsightsForComponent(
      componentId,
      req.user!.id
    );

    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Failed to get component insights');
    res.status(500).json({
      error: 'Failed to get component insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/entry/:entryId
 * Get insights for an entry
 */
router.get('/entry/:entryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entryId } = req.params;

    const insights = await insightStorageService.getInsightsForEntry(
      entryId,
      req.user!.id
    );

    res.json({ insights });
  } catch (error) {
    logger.error({ error }, 'Failed to get entry insights');
    res.status(500).json({
      error: 'Failed to get entry insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/insights/generate
 * Generate and store new insights
 */
router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await buildPayload(req.user!.id);
    const pythonInsights = await runInsightEngine(payload);

    // Store insights in database (if Python engine returns structured data)
    // This is a placeholder - actual implementation depends on Python engine output format
    res.json({
      insights: pythonInsights,
      message: 'Insights generated',
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to generate insights');
    res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message ?? 'Unknown error',
    });
  }
});

export const insightsRouter = router;
