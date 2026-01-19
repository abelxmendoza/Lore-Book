/**
 * LORE-KEEPER PERSPECTIVE-AWARE MEMORY LAYER
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { perspectiveService } from '../services/perspectiveService';

const router = Router();

/**
 * GET /api/perspectives
 * Get all perspectives for user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const perspectives = await perspectiveService.getPerspectives(req.user!.id);
    res.json({ perspectives });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perspectives');
    res.status(500).json({ error: 'Failed to get perspectives' });
  }
});

/**
 * POST /api/perspectives
 * Create a new perspective
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { type, owner_entity_id, label, reliability_modifier } = req.body;

    if (!type || !label) {
      return res.status(400).json({ error: 'type and label are required' });
    }

    const perspective = await perspectiveService.createPerspective(req.user!.id, {
      type,
      owner_entity_id,
      label,
      reliability_modifier,
    });

    res.json({ perspective });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create perspective');
    res.status(500).json({ error: 'Failed to create perspective' });
  }
});

/**
 * POST /api/perspectives/defaults
 * Get or create default perspectives
 */
router.post('/defaults', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(req.user!.id);
    res.json({ perspectives });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get default perspectives');
    res.status(500).json({ error: 'Failed to get default perspectives' });
  }
});

/**
 * POST /api/perspectives/claims
 * Ingest claim with perspective
 */
router.post('/claims', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { claim_id, perspective_id } = req.body;

    if (!claim_id || !perspective_id) {
      return res.status(400).json({ error: 'claim_id and perspective_id are required' });
    }

    // Get base claim
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { data: claim } = await supabaseAdmin
      .from('omega_claims')
      .select('*')
      .eq('id', claim_id)
      .eq('user_id', req.user!.id)
      .single();

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const perspectiveClaim = await perspectiveService.ingestClaimWithPerspective(
      req.user!.id,
      claim,
      perspective_id
    );

    res.json({ perspective_claim: perspectiveClaim });
  } catch (error) {
    logger.error({ err: error }, 'Failed to ingest claim with perspective');
    res.status(500).json({ error: 'Failed to ingest claim with perspective' });
  }
});

/**
 * GET /api/perspectives/claims/:claimId
 * Get perspective claims for a base claim
 */
router.get('/claims/:claimId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { claimId } = req.params;
    const claims = await perspectiveService.getPerspectiveClaims(claimId, req.user!.id);
    res.json({ perspective_claims: claims });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perspective claims');
    res.status(500).json({ error: 'Failed to get perspective claims' });
  }
});

/**
 * GET /api/perspectives/contradictions/:claimId
 * Detect perspective contradictions for a claim
 */
router.get('/contradictions/:claimId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { claimId } = req.params;
    const contradictions = await perspectiveService.detectPerspectiveContradictions(
      req.user!.id,
      claimId
    );
    res.json({ contradictions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to detect contradictions');
    res.status(500).json({ error: 'Failed to detect contradictions' });
  }
});

/**
 * GET /api/perspectives/entities/:entityId/ranked
 * Rank claims by perspective for an entity
 */
router.get('/entities/:entityId/ranked', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entityId } = req.params;
    const ranked = await perspectiveService.rankClaimsByPerspective(entityId, req.user!.id);
    res.json({ ranked_claims: ranked });
  } catch (error) {
    logger.error({ err: error }, 'Failed to rank claims by perspective');
    res.status(500).json({ error: 'Failed to rank claims by perspective' });
  }
});

/**
 * GET /api/perspectives/entities/:entityId/summary
 * Get entity summary with perspectives (non-collapsing)
 */
router.get('/entities/:entityId/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entityId } = req.params;
    const summary = await perspectiveService.summarizeEntityWithPerspectives(
      entityId,
      req.user!.id
    );
    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Failed to summarize entity with perspectives');
    res.status(500).json({ error: 'Failed to summarize entity with perspectives' });
  }
});

/**
 * POST /api/perspectives/claims/:claimId/evolve
 * Evolve a perspective claim
 */
router.post('/claims/:claimId/evolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { claimId } = req.params;
    const { new_text } = req.body;

    if (!new_text || typeof new_text !== 'string') {
      return res.status(400).json({ error: 'new_text is required' });
    }

    const evolvedClaim = await perspectiveService.evolvePerspectiveClaim(
      req.user!.id,
      claimId,
      new_text
    );

    res.json({ perspective_claim: evolvedClaim });
  } catch (error) {
    logger.error({ err: error }, 'Failed to evolve perspective claim');
    res.status(500).json({ error: 'Failed to evolve perspective claim' });
  }
});

export const perspectivesRouter = router;

