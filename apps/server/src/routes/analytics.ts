/**
 * Analytics API Routes
 * Provides endpoints for all analytics modules.
 * All modules run through the execution orchestrator (Blueprint V2); results remain backward-compatible.
 */

import { Response } from 'express';
import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
  identityPulseModule,
  relationshipAnalyticsModule,
  sagaEngineModule,
  characterAnalyticsModule,
  memoryFabricModule,
  insightEngineModule,
  predictionEngineModule,
  shadowEngineModule,
  xpEngineModule,
  lifeMapModule,
  searchEngineModule,
} from '../services/analytics';
import type { AnalyticsPayload, AnalyticsResult } from '../services/analytics/types';
import { buildAnalyticsContext, runLegacyAnalytics } from '../services/analytics/orchestrator';

const router = Router();

/** Send 200 + ANALYTICS_DEGRADED when a module failed; keeps the request resilient. */
function sendDegraded(
  res: Response,
  result: AnalyticsResult<AnalyticsPayload>,
  logContext: { userId: string; message: string }
): Response {
  logger.error({ userId: logContext.userId, diagnostics: result.diagnostics }, logContext.message);
  return res.status(200).json({ error: 'ANALYTICS_DEGRADED', diagnostics: result.diagnostics });
}

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/analytics/identity
 * Get identity pulse analytics with enhanced structure
 * Query params: timeRange (30, 90, 180, all)
 */
router.get('/identity', async (req: AuthenticatedRequest, res) => {
  const timeRange = (req.query.timeRange as string) || '30';
  const context = await buildAnalyticsContext({ userId: req.user!.id, timeRange });
  const result = await runLegacyAnalytics('identity', context, (ctx) =>
    identityPulseModule.runEnhanced(ctx.userId, ctx.timeRange ?? '30')
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Identity pulse failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/relationships
 * Get relationship analytics
 */
router.get('/relationships', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('relationships', context, (ctx) =>
    relationshipAnalyticsModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Relationship analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/saga
 * Get saga/arc analytics
 */
router.get('/saga', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('saga', context, (ctx) => sagaEngineModule.run(ctx.userId));
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Saga analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/characters
 * Get character analytics
 */
router.get('/characters', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('characters', context, (ctx) =>
    characterAnalyticsModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Character analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/memory-fabric
 * Get memory fabric graph analytics
 */
router.get('/memory-fabric', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('memory-fabric', context, (ctx) =>
    memoryFabricModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Memory fabric analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/insights
 * Get insight analytics
 */
router.get('/insights', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('insights', context, (ctx) =>
    insightEngineModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Insight analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/predictions
 * Get prediction analytics
 */
router.get('/predictions', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('predictions', context, (ctx) =>
    predictionEngineModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Prediction analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/shadow
 * Get shadow analytics
 */
router.get('/shadow', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('shadow', context, (ctx) =>
    shadowEngineModule.run(ctx.userId)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Shadow analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/xp
 * Get XP gamification analytics
 */
router.get('/xp', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('xp', context, (ctx) => xpEngineModule.run(ctx.userId));
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'XP analytics failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/map
 * Get life map analytics
 */
router.get('/map', async (req: AuthenticatedRequest, res) => {
  const context = await buildAnalyticsContext({ userId: req.user!.id });
  const result = await runLegacyAnalytics('map', context, (ctx) => lifeMapModule.run(ctx.userId));
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Life map analytics failed' });
  res.json(result.value);
});

/**
 * POST /api/analytics/search
 * Search memories with combined keyword/semantic search
 */
router.post('/search', async (req: AuthenticatedRequest, res) => {
  const { query, filters } = req.body ?? {};
  const context = await buildAnalyticsContext({
    userId: req.user!.id,
    searchOptions: { query, filters },
  });
  const result = await runLegacyAnalytics('search', context, (ctx) =>
    searchEngineModule.run(ctx.userId, ctx.searchOptions)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Search failed' });
  res.json(result.value);
});

/**
 * GET /api/analytics/search
 * Search memories with query parameter
 */
router.get('/search', async (req: AuthenticatedRequest, res) => {
  const { q: query, ...rest } = req.query;
  const context = await buildAnalyticsContext({
    userId: req.user!.id,
    searchOptions: { query: query as string, filters: rest as Record<string, unknown> },
  });
  const result = await runLegacyAnalytics('search', context, (ctx) =>
    searchEngineModule.run(ctx.userId, ctx.searchOptions)
  );
  if (result.value === null) return sendDegraded(res, result, { userId: req.user!.id, message: 'Search failed' });
  res.json(result.value);
});

/**
 * POST /api/analytics/refresh
 * Force refresh analytics cache for a specific module
 */
router.post('/refresh', async (req: AuthenticatedRequest, res) => {
  try {
    const { type } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Type parameter required' });
    }

    // Delete cache entry to force refresh
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { error } = await supabaseAdmin
      .from('analytics_cache')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('type', type);

    if (error) {
      logger.error({ error }, 'Error clearing cache');
      return res.status(500).json({ error: 'Failed to clear cache' });
    }

    res.json({ message: 'Cache cleared, next request will regenerate analytics' });
  } catch (error) {
    logger.error({ error }, 'Error refreshing analytics');
    res.status(500).json({ error: 'Failed to refresh analytics' });
  }
});

export const analyticsRouter = router;

