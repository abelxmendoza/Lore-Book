/**
 * LORE-KEEPER CONVERSATIONAL ORCHESTRATION LAYER (COL)
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { conversationalOrchestrationService } from '../services/conversationalOrchestrationService';

const router = Router();

/**
 * POST /api/chat/message
 * Handle user message and generate response
 */
router.post('/message', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const response = await conversationalOrchestrationService.handleUserMessage(
      req.user!.id,
      message,
      session_id
    );

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Failed to handle chat message');
    res.status(500).json({ error: 'Failed to handle chat message' });
  }
});

/**
 * GET /api/chat/history/:sessionId
 * Get chat history for a session
 */
router.get('/history/:sessionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { limit } = req.query;

    const history = await conversationalOrchestrationService.getChatHistory(
      req.user!.id,
      sessionId,
      limit ? parseInt(limit as string, 10) : 50
    );

    res.json({ messages: history });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get chat history');
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

export const chatOrchestrationRouter = router;

