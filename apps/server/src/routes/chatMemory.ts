import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { ChatEngine } from '../services/chat/chatEngine';

const router = Router();
const engine = new ChatEngine();

/**
 * Validate request body
 */
function validateRequest(body: any): { error?: string } {
  const { message, conversationHistory } = body;

  if (!message || typeof message !== 'string') {
    return { error: 'Message is required' };
  }

  if (message.length > 5000) {
    return { error: 'Message too long (max 5000 characters)' };
  }

  if (conversationHistory && !Array.isArray(conversationHistory)) {
    return { error: 'conversationHistory must be an array' };
  }

  if (conversationHistory) {
    for (const item of conversationHistory) {
      if (!item.role || !item.content) {
        return { error: 'Each conversationHistory item must have role and content' };
      }
      if (!['user', 'assistant'].includes(item.role)) {
        return { error: 'conversationHistory role must be "user" or "assistant"' };
      }
    }
  }

  return {};
}

/**
 * POST /api/chat-memory
 * AI Memory Chat endpoint (non-streaming)
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { message, maxContext, conversationHistory } = req.body;

    const validation = validateRequest(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const response = await engine.handleChat({
      userId,
      message,
      maxContext: maxContext || 20,
      conversationHistory: conversationHistory || [],
    });

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Error in memory chat endpoint');
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

/**
 * POST /api/chat-memory/stream
 * AI Memory Chat endpoint (streaming)
 */
router.post('/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { message, maxContext, conversationHistory } = req.body;

    const validation = validateRequest(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await engine.handleChatStream({
      userId,
      message,
      maxContext: maxContext || 20,
      conversationHistory: conversationHistory || [],
    });

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

      // Send done signal
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (streamError) {
      logger.error({ error: streamError }, 'Error streaming response');
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error({ error }, 'Error in streaming memory chat endpoint');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process streaming chat request' });
    } else {
      res.end();
    }
  }
});

export default router;

