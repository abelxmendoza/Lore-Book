import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { RecommendationEngine } from '../services/recommendation/recommendationEngine';
import { recommendationStorageService } from '../services/recommendation/storageService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();
const recommendationEngine = new RecommendationEngine();

/**
 * GET /api/recommendations
 * Get active recommendations for user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const userId = req.user!.id;

    const payload = await recommendationEngine.getActiveRecommendations(userId, limit);

    res.json(payload);
  })
);

/**
 * GET /api/recommendations/history
 * Get recommendation history
 */
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const userId = req.user!.id;

    const history = await recommendationStorageService.getRecommendationHistory(userId, limit);

    res.json({ recommendations: history, total: history.length });
  })
);

/**
 * POST /api/recommendations/:id/show
 * Mark recommendation as shown
 */
router.post(
  '/:id/show',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify recommendation belongs to user
    const { data: rec } = await supabaseAdmin
      .from('recommendations')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!rec || rec.user_id !== userId) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    await recommendationEngine.markAsShown(id);

    res.json({ success: true });
  })
);

/**
 * POST /api/recommendations/:id/dismiss
 * Dismiss recommendation
 */
router.post(
  '/:id/dismiss',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify recommendation belongs to user
    const { data: rec } = await supabaseAdmin
      .from('recommendations')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!rec || rec.user_id !== userId) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    await recommendationEngine.markAsDismissed(id);

    res.json({ success: true });
  })
);

/**
 * POST /api/recommendations/:id/act
 * Mark recommendation as acted upon
 */
router.post(
  '/:id/act',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify recommendation belongs to user
    const { data: rec } = await supabaseAdmin
      .from('recommendations')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!rec || rec.user_id !== userId) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    await recommendationEngine.markAsActedUpon(id);

    res.json({ success: true });
  })
);

/**
 * POST /api/recommendations/refresh
 * Force refresh recommendations
 */
router.post(
  '/refresh',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    logger.info({ userId }, 'Forcing recommendation refresh');

    // Generate new recommendations
    const recommendations = await recommendationEngine.generateRecommendations(userId);

    // Save to database
    await recommendationStorageService.saveRecommendations(recommendations);

    // Mark old pending recommendations as dismissed
    await recommendationStorageService.markAsExpired(userId);

    res.json({
      success: true,
      generated: recommendations.length,
    });
  })
);

/**
 * GET /api/recommendations/stats
 * Get recommendation statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const stats = await recommendationStorageService.getStats(userId);

    res.json(stats);
  })
);

export default router;

