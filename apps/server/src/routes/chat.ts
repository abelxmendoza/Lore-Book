import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { omegaChatService } from '../services/omegaChatService';
import { logger } from '../logger';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  stream: z.boolean().optional().default(false)
});

// Streaming endpoint
router.post('/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [] } = parsed.data;
    const userId = req.user!.id;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await omegaChatService.chatStream(userId, message, conversationHistory);

    // Send metadata first
    res.write(`data: ${JSON.stringify({ type: 'metadata', data: result.metadata })}\n\n`);

    // Stream response chunks
    try {
      for await (const chunk of result.stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error) {
      logger.error({ error }, 'Stream error');
      res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error({ err: error }, 'Chat stream endpoint error');
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Non-streaming endpoint (fallback)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], stream } = parsed.data;
    const userId = req.user!.id;

    // If streaming requested but endpoint is /, redirect to /stream
    if (stream) {
      return res.status(400).json({ error: 'Use /api/chat/stream for streaming' });
    }

    const result = await omegaChatService.chat(userId, message, conversationHistory);

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ err: error }, 'Chat endpoint error');
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const chatRouter = router;
