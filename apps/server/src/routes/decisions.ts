/**
 * LORE-KEEPER DECISION MEMORY ENGINE (DME)
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { decisionMemoryService } from '../services/decisionMemoryService';

const router = Router();

/**
 * POST /api/decisions/propose
 * Propose decision capture (for chatbot integration)
 */
router.post('/propose', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, entity_ids, claim_ids, insight_ids } = req.body;

    const proposal = await decisionMemoryService.proposeDecisionCapture(req.user!.id, {
      message,
      entity_ids,
      claim_ids,
      insight_ids,
    });

    if (!proposal) {
      return res.status(400).json({ error: 'Failed to propose decision capture' });
    }

    res.json({ proposal });
  } catch (error) {
    logger.error({ err: error }, 'Failed to propose decision capture');
    res.status(500).json({ error: 'Failed to propose decision capture' });
  }
});

/**
 * POST /api/decisions
 * Record a decision with options and rationale
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { decision, options, rationale } = req.body;

    if (!decision || !options || !rationale) {
      return res.status(400).json({ error: 'decision, options, and rationale are required' });
    }

    if (!Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: 'options must be a non-empty array' });
    }

    const summary = await decisionMemoryService.recordDecision(
      req.user!.id,
      decision,
      options,
      rationale
    );

    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Failed to record decision');
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

/**
 * GET /api/decisions
 * Get decisions for user with optional filters
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { decision_type, entity_id, limit, offset } = req.query;

    const filters: any = {};
    if (decision_type) filters.decision_type = decision_type;
    if (entity_id) filters.entity_id = entity_id as string;
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (offset) filters.offset = parseInt(offset as string, 10);

    const decisions = await decisionMemoryService.getDecisions(req.user!.id, filters);

    res.json({ decisions, count: decisions.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get decisions');
    res.status(500).json({ error: 'Failed to get decisions' });
  }
});

/**
 * GET /api/decisions/:id
 * Get decision summary with all related data
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const summary = await decisionMemoryService.summarizeDecision(id, req.user!.id);

    if (!summary) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get decision summary');
    res.status(500).json({ error: 'Failed to get decision summary' });
  }
});

/**
 * GET /api/decisions/similar
 * Get similar past decisions
 */
router.get('/similar', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { decision_type, entity_ids, message, threshold } = req.query;

    const context: any = {};
    if (decision_type) context.decision_type = decision_type;
    if (entity_ids) context.entity_ids = Array.isArray(entity_ids) ? entity_ids : [entity_ids];
    if (message) context.message = message;

    const similar = await decisionMemoryService.getSimilarPastDecisions(
      req.user!.id,
      context,
      threshold ? parseFloat(threshold as string) : 0.6
    );

    res.json({ decisions: similar, count: similar.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get similar decisions');
    res.status(500).json({ error: 'Failed to get similar decisions' });
  }
});

/**
 * POST /api/decisions/:id/outcomes
 * Record decision outcome (post-hoc)
 */
router.post('/:id/outcomes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { outcome_text, sentiment, linked_claim_ids } = req.body;

    if (!outcome_text || typeof outcome_text !== 'string') {
      return res.status(400).json({ error: 'outcome_text is required' });
    }

    const outcome = await decisionMemoryService.recordDecisionOutcome(
      req.user!.id,
      id,
      {
        outcome_text,
        sentiment,
        linked_claim_ids,
      }
    );

    res.json({ outcome });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record decision outcome');
    res.status(500).json({ error: 'Failed to record decision outcome' });
  }
});

export const decisionsRouter = router;
