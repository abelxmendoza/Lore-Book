/**
 * OMEGA MEMORY ENGINE — API Routes
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { omegaMemoryService } from '../services/omegaMemoryService';
import { logger } from '../logger';

const router = Router();

/**
 * POST /api/omega-memory/ingest
 * Ingest text and extract entities, claims, relationships
 */
router.post('/ingest', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { text, source } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await omegaMemoryService.ingestText(
      req.user!.id,
      text,
      source || 'USER'
    );

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to ingest text');
    res.status(500).json({ error: 'Failed to ingest text' });
  }
});

/**
 * GET /api/omega-memory/entities
 * Get all entities for user
 */
router.get('/entities', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { type } = req.query;
    const entities = await omegaMemoryService.getEntities(
      req.user!.id,
      type as any
    );

    res.json({ entities });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get entities');
    res.status(500).json({ error: 'Failed to get entities' });
  }
});

/**
 * GET /api/omega-memory/entities/:id/claims
 * Get claims for an entity
 */
router.get('/entities/:id/claims', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { active_only } = req.query;

    const claims = await omegaMemoryService.getClaimsForEntity(
      req.user!.id,
      id,
      active_only !== 'false'
    );

    res.json({ claims });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get claims');
    res.status(500).json({ error: 'Failed to get claims' });
  }
});

/**
 * GET /api/omega-memory/entities/:id/ranked-claims
 * Get ranked claims for an entity
 */
router.get('/entities/:id/ranked-claims', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const rankedClaims = await omegaMemoryService.rankClaims(id);

    res.json({ claims: rankedClaims });
  } catch (error) {
    logger.error({ err: error }, 'Failed to rank claims');
    res.status(500).json({ error: 'Failed to rank claims' });
  }
});

/**
 * GET /api/omega-memory/entities/:id/summary
 * Get entity summary with narrative
 */
router.get('/entities/:id/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const summary = await omegaMemoryService.summarizeEntity(id);

    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Failed to summarize entity');
    res.status(500).json({ error: 'Failed to summarize entity' });
  }
});

/**
 * POST /api/omega-memory/claims/:id/evidence
 * Add evidence to a claim with reliability scoring
 */
router.post('/claims/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { content, source, source_type } = req.body;

    if (!content || !source) {
      return res.status(400).json({ error: 'Content and source are required' });
    }

    const evidence = await omegaMemoryService.addEvidence(
      req.user!.id,
      id,
      content,
      source,
      source_type || 'journal_entry'
    );

    res.json({ evidence });
  } catch (error) {
    logger.error({ err: error }, 'Failed to add evidence');
    res.status(500).json({ error: 'Failed to add evidence' });
  }
});

/**
 * POST /api/omega-memory/suggestions/:id/approve
 * Approve and apply an update suggestion
 */
router.post('/suggestions/:id/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const suggestion = req.body;

    await omegaMemoryService.approveUpdate(req.user!.id, suggestion);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to approve suggestion');
    res.status(500).json({ error: 'Failed to approve suggestion' });
  }
});

export const omegaMemoryRouter = router;

