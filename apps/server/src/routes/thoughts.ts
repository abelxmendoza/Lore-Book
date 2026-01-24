/**
 * Thought Classification and Response API Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { thoughtOrchestrationService } from '../services/thoughtOrchestration/thoughtOrchestrationService';
import { thoughtClassificationService } from '../services/thoughtClassification/thoughtClassificationService';
import { insecurityGraphService } from '../services/insecurityGraph/insecurityGraphService';
import { thoughtResponseService } from '../services/thoughtResponse/thoughtResponseService';
import { logger } from '../logger';

const router = Router();

// ============================================================================
// Thought Processing (Main Entry Point)
// ============================================================================

/**
 * POST /api/thoughts/process
 * Process a passing thought end-to-end (<300ms target)
 */
router.post('/process', authenticate, async (req, res) => {
  try {
    const { thoughtText, entryId, messageId } = req.body;
    const userId = req.user!.id;

    if (!thoughtText || typeof thoughtText !== 'string') {
      return res.status(400).json({ error: 'thoughtText is required' });
    }

    const result = await thoughtOrchestrationService.processThought(
      userId,
      thoughtText,
      { entryId, messageId }
    );

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to process thought');
    res.status(500).json({ error: 'Failed to process thought' });
  }
});

/**
 * POST /api/thoughts/classify
 * Quick classification only (for real-time UI feedback)
 */
router.post('/classify', authenticate, async (req, res) => {
  try {
    const { thoughtText } = req.body;
    const userId = req.user!.id;

    if (!thoughtText || typeof thoughtText !== 'string') {
      return res.status(400).json({ error: 'thoughtText is required' });
    }

    const classification = await thoughtOrchestrationService.quickClassify(
      userId,
      thoughtText
    );

    res.json({ classification });
  } catch (error) {
    logger.error({ err: error }, 'Failed to classify thought');
    res.status(500).json({ error: 'Failed to classify thought' });
  }
});

// ============================================================================
// Insecurity Patterns
// ============================================================================

/**
 * GET /api/thoughts/insecurities
 * Get user's insecurity patterns
 */
router.get('/insecurities', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const domain = req.query.domain as string | undefined;

    const patterns = await insecurityGraphService.getUserPatterns(userId, domain);

    res.json({ patterns });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get insecurity patterns');
    res.status(500).json({ error: 'Failed to get insecurity patterns' });
  }
});

// ============================================================================
// Response Feedback
// ============================================================================

/**
 * PUT /api/thoughts/responses/:responseId/feedback
 * Record user feedback on response
 */
router.put('/responses/:responseId/feedback', authenticate, async (req, res) => {
  try {
    const { responseId } = req.params;
    const { wasHelpful } = req.body;
    const userId = req.user!.id;

    if (typeof wasHelpful !== 'boolean') {
      return res.status(400).json({ error: 'wasHelpful must be a boolean' });
    }

    const response = await thoughtResponseService.recordFeedback(
      userId,
      responseId,
      wasHelpful
    );

    res.json({ response });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record feedback');
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

export default router;
