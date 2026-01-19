/**
 * Analytics API Routes
 * Provides endpoints for all analytics modules
 */

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

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/analytics/identity
 * Get identity pulse analytics with enhanced structure
 * Query params: timeRange (30, 90, 180, all)
 */
router.get('/identity', async (req: AuthenticatedRequest, res) => {
  try {
    const timeRange = req.query.timeRange as string || '30';
    const payload = await identityPulseModule.runEnhanced(req.user!.id, timeRange);
    // Return the enhanced payload directly (it's already in the right format)
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating identity pulse');
    res.status(500).json({ error: 'Failed to generate identity pulse analytics' });
  }
});

/**
 * GET /api/analytics/relationships
 * Get relationship analytics
 */
router.get('/relationships', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await relationshipAnalyticsModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating relationship analytics');
    res.status(500).json({ error: 'Failed to generate relationship analytics' });
  }
});

/**
 * GET /api/analytics/saga
 * Get saga/arc analytics
 */
router.get('/saga', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await sagaEngineModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating saga analytics');
    res.status(500).json({ error: 'Failed to generate saga analytics' });
  }
});

/**
 * GET /api/analytics/characters
 * Get character analytics
 */
router.get('/characters', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const payload = await characterAnalyticsModule.run(userId);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating character analytics');
    res.status(500).json({ error: 'Failed to generate character analytics' });
  }
});

/**
 * GET /api/analytics/memory-fabric
 * Get memory fabric graph analytics
 */
router.get('/memory-fabric', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await memoryFabricModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating memory fabric analytics');
    res.status(500).json({ error: 'Failed to generate memory fabric analytics' });
  }
});

/**
 * GET /api/analytics/insights
 * Get insight analytics
 */
router.get('/insights', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await insightEngineModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating insight analytics');
    res.status(500).json({ error: 'Failed to generate insight analytics' });
  }
});

/**
 * GET /api/analytics/predictions
 * Get prediction analytics
 */
router.get('/predictions', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await predictionEngineModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating prediction analytics');
    res.status(500).json({ error: 'Failed to generate prediction analytics' });
  }
});

/**
 * GET /api/analytics/shadow
 * Get shadow analytics
 */
router.get('/shadow', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await shadowEngineModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating shadow analytics');
    res.status(500).json({ error: 'Failed to generate shadow analytics' });
  }
});

/**
 * GET /api/analytics/xp
 * Get XP gamification analytics
 */
router.get('/xp', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await xpEngineModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating XP analytics');
    res.status(500).json({ error: 'Failed to generate XP analytics' });
  }
});

/**
 * GET /api/analytics/map
 * Get life map analytics
 */
router.get('/map', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await lifeMapModule.run(req.user!.id);
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error generating life map analytics');
    res.status(500).json({ error: 'Failed to generate life map analytics' });
  }
});

/**
 * POST /api/analytics/search
 * Search memories with combined keyword/semantic search
 */
router.post('/search', async (req: AuthenticatedRequest, res) => {
  try {
    const { query, filters } = req.body;
    const payload = await searchEngineModule.run(req.user!.id, { query, filters });
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error performing search');
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

/**
 * GET /api/analytics/search
 * Search memories with query parameter
 */
router.get('/search', async (req: AuthenticatedRequest, res) => {
  try {
    const { q: query, ...filters } = req.query;
    const payload = await searchEngineModule.run(req.user!.id, { 
      query: query as string,
      filters: filters as any
    });
    res.json(payload);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Error performing search');
    res.status(500).json({ error: 'Failed to perform search' });
  }
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

