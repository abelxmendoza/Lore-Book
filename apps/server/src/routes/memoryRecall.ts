/**
 * Memory Recall Engine API Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { memoryRecallEngine } from '../services/memoryRecall/memoryRecallEngine';
import { logger } from '../logger';

const router = Router();

const recallQuerySchema = z.object({
  raw_text: z.string().min(1).max(1000),
  persona: z.enum(['DEFAULT', 'ARCHIVIST']).optional(),
  timeframe: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/memory-recall/query
 * Execute a natural language recall query
 */
router.post(
  '/query',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = recallQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { raw_text, persona, timeframe } = parsed.data;

      const result = await memoryRecallEngine.executeRecall({
        raw_text,
        user_id: req.user.id,
        persona: persona || 'DEFAULT',
        timeframe,
      });

      logger.debug(
        {
          userId: req.user.id,
          query: raw_text,
          resultCount: result.entries.length,
          confidence: result.confidence,
        },
        'Memory recall query executed'
      );

      return res.json(result);
    } catch (error) {
      logger.error({ error, userId: req.user.id }, 'Failed to execute recall query');
      return res.status(500).json({ error: 'Failed to execute recall query' });
    }
  }
);

/**
 * POST /api/memory-recall/chat
 * Handle recall in chat context (returns formatted string)
 */
router.post(
  '/chat',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = recallQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { raw_text, persona, timeframe } = parsed.data;

      const response = await memoryRecallEngine.handleRecallChat({
        raw_text,
        user_id: req.user.id,
        persona: persona || 'DEFAULT',
        timeframe,
      });

      return res.json({ response });
    } catch (error) {
      logger.error({ error, userId: req.user.id }, 'Failed to handle recall chat');
      return res.status(500).json({ error: 'Failed to handle recall chat' });
    }
  }
);

export default router;

