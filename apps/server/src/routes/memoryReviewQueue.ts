/**
 * LORE-KEEPER MEMORY REVIEW QUEUE (MRQ)
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoryReviewQueueService } from '../services/memoryReviewQueueService';

const router = Router();

/**
 * GET /api/mrq/pending
 * Get pending memory review queue items
 */
router.get('/pending', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await memoryReviewQueueService.getPendingMRQ(req.user!.id);
    res.json({ items });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get pending MRQ');
    res.status(500).json({ error: 'Failed to get pending MRQ' });
  }
});

/**
 * GET /api/mrq/proposals/:id
 * Get a specific proposal
 */
router.get('/proposals/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const proposal = await memoryReviewQueueService.getProposal(id, req.user!.id);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json({ proposal });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get proposal');
    res.status(500).json({ error: 'Failed to get proposal' });
  }
});

/**
 * POST /api/mrq/proposals/:id/approve
 * Approve a memory proposal
 */
router.post('/proposals/:id/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const decision = await memoryReviewQueueService.approveProposal(req.user!.id, id);
    res.json({ decision, success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to approve proposal');
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

/**
 * POST /api/mrq/proposals/:id/reject
 * Reject a memory proposal
 */
router.post('/proposals/:id/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const decision = await memoryReviewQueueService.rejectProposal(req.user!.id, id, reason);
    res.json({ decision, success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to reject proposal');
    res.status(500).json({ error: 'Failed to reject proposal' });
  }
});

/**
 * POST /api/mrq/proposals/:id/edit
 * Edit a memory proposal
 */
router.post('/proposals/:id/edit', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { new_text, new_confidence } = req.body;

    if (!new_text || typeof new_text !== 'string') {
      return res.status(400).json({ error: 'new_text is required' });
    }

    const decision = await memoryReviewQueueService.editProposal(
      req.user!.id,
      id,
      new_text,
      new_confidence
    );

    res.json({ decision, success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to edit proposal');
    res.status(500).json({ error: 'Failed to edit proposal' });
  }
});

/**
 * POST /api/mrq/proposals/:id/defer
 * Defer a memory proposal
 */
router.post('/proposals/:id/defer', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const decision = await memoryReviewQueueService.deferProposal(req.user!.id, id);
    res.json({ decision, success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to defer proposal');
    res.status(500).json({ error: 'Failed to defer proposal' });
  }
});

export const memoryReviewQueueRouter = router;

