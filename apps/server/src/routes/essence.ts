/**
 * Essence Profile API Routes
 * Handles essence profile retrieval, extraction, and management
 */

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { essenceProfileService } from '../services/essenceProfileService';
import { memoryService } from '../services/memoryService';

const router = Router();

/**
 * GET /api/essence/profile
 * Get user's current essence profile
 */
router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await essenceProfileService.getProfile(req.user!.id);
    res.json({ profile });
  } catch (error) {
    logger.error({ error }, 'Failed to get essence profile');
    res.status(500).json({ error: 'Failed to get essence profile' });
  }
});

/**
 * POST /api/essence/extract
 * Trigger manual essence extraction from recent entries
 */
router.post('/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const entries = await memoryService.searchEntries(req.user!.id, { limit: 50 });
    const entriesData = entries.map(e => ({
      content: e.content,
      date: e.date,
      summary: e.summary || undefined
    }));

    const insights = await essenceProfileService.extractEssence(req.user!.id, [], entriesData);
    
    if (Object.keys(insights).length > 0) {
      await essenceProfileService.updateProfile(req.user!.id, insights);
    }

    res.json({ insights, updated: true });
  } catch (error) {
    logger.error({ error }, 'Failed to extract essence');
    res.status(500).json({ error: 'Failed to extract essence' });
  }
});

/**
 * PUT /api/essence/skills
 * Update skills (user-curated)
 */
const updateSkillsSchema = z.object({
  skills: z.array(z.object({
    skill: z.string(),
    confidence: z.number().optional(),
    evidence: z.array(z.string()).optional()
  }))
});

router.put('/skills', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateSkillsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const profile = await essenceProfileService.getProfile(req.user!.id);
    const now = new Date().toISOString();
    
    const updatedSkills = parsed.data.skills.map(s => ({
      skill: s.skill,
      confidence: s.confidence || 1.0,
      evidence: s.evidence || [],
      extractedAt: now
    }));

    await essenceProfileService.updateProfile(req.user!.id, {
      topSkills: updatedSkills
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update skills');
    res.status(500).json({ error: 'Failed to update skills' });
  }
});

/**
 * GET /api/essence/evolution
 * Get evolution timeline
 */
router.get('/evolution', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const evolution = await essenceProfileService.getEvolution(req.user!.id);
    res.json({ evolution });
  } catch (error) {
    logger.error({ error }, 'Failed to get evolution');
    res.status(500).json({ error: 'Failed to get evolution' });
  }
});

/**
 * POST /api/essence/refine
 * User refines/corrects AI findings via chat-driven refinement
 * This endpoint is called by EssenceRefinementEngine after intent detection
 */
const refineSchema = z.object({
  userId: z.string().uuid(),
  insightId: z.string(),
  action: z.enum(['affirm', 'downgrade_confidence', 'reject', 'time_bound', 'scope_refine', 'split_insight']),
  metadata: z.object({
    reason: z.string(),
    originalText: z.string(),
    refinementText: z.string().optional(),
    temporalScope: z.object({
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
      era: z.string().optional()
    }).optional(),
    domainScope: z.string().optional(),
    confidenceChange: z.number().optional()
  })
});

router.post('/refine', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = refineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { userId, insightId, action, metadata } = parsed.data;

    // Verify user owns this request
    if (userId !== req.user!.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // The actual refinement is handled by EssenceRefinementEngine
    // This endpoint just validates and acknowledges
    // The engine already applied the changes via saveFullProfile
    
    logger.info({ userId, insightId, action }, 'Essence refinement applied via chat');

    res.json({ 
      success: true,
      message: 'Refinement applied successfully',
      action,
      insightId
    });
  } catch (error) {
    logger.error({ error }, 'Failed to process essence refinement');
    res.status(500).json({ error: 'Failed to process refinement' });
  }
});

export const essenceRouter = router;


