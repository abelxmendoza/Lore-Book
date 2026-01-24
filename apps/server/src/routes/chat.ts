import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { checkAiRequestLimit } from '../middleware/subscription';
import { omegaChatService } from '../services/omegaChatService';
import { ChatPersonaRL } from '../services/reinforcementLearning/chatPersonaRL';
import { incrementAiRequestCount } from '../services/usageTracking';

const personaRL = new ChatPersonaRL();

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  stream: z.boolean().optional().default(false),
  entityContext: z.object({
    type: z.enum(['CHARACTER', 'LOCATION', 'PERCEPTION', 'MEMORY', 'ENTITY', 'GOSSIP']),
    id: z.string().uuid()
  }).optional()
});

// Optional auth middleware for testing
const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // If DISABLE_AUTH_FOR_DEV is set, use dev user
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.API_ENV === 'dev';
  const allowDevBypass = isDevelopment && process.env.DISABLE_AUTH_FOR_DEV === 'true';
  
  if (allowDevBypass && !req.user) {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'dev@example.com',
      lastSignInAt: new Date().toISOString()
    };
    return next();
  }
  
  // Try to authenticate, but don't fail if no auth
  try {
    await requireAuth(req, res, () => next());
  } catch {
    // If auth fails, use dev user for testing
    if (isDevelopment) {
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@example.com',
        lastSignInAt: new Date().toISOString()
      };
      next();
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }
  }
};

// Streaming endpoint
router.post('/stream', optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], entityContext } = parsed.data;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await omegaChatService.chatStream(userId, message, conversationHistory, entityContext);

    // Increment usage count (fire and forget)
    incrementAiRequestCount(userId).catch(err => 
      logger.warn({ error: err }, 'Failed to increment AI request count')
    );

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
router.post('/', optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], stream, entityContext } = parsed.data;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    // If streaming requested but endpoint is /, redirect to /stream
    if (stream) {
      return res.status(400).json({ error: 'Use /api/chat/stream for streaming' });
    }

    const result = await omegaChatService.chat(userId, message, conversationHistory, entityContext);

    // Increment usage count (fire and forget)
    incrementAiRequestCount(userId).catch(err => 
      logger.warn({ error: err }, 'Failed to increment AI request count')
    );

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

// Test OpenAI connection endpoint
router.get('/test-openai', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { openai } = await import('../lib/openai');
    const { config } = await import('../config');
    
    if (!config.openAiKey || config.openAiKey === '' || config.openAiKey.startsWith('sk-xxx')) {
      return res.status(400).json({
        error: 'OpenAI API key not configured',
        message: 'Please set OPENAI_API_KEY in your .env file. Get your key from https://platform.openai.com/api-keys'
      });
    }

    // Test with a simple completion
    const testCompletion = await openai.chat.completions.create({
      model: config.defaultModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello, OpenAI is working!" if you can read this.' }
      ],
      max_tokens: 20,
      temperature: 0.7
    });

    const response = testCompletion.choices[0]?.message?.content || 'No response';
    
    res.json({
      success: true,
      message: 'OpenAI API is working!',
      response,
      model: config.defaultModel,
      apiKeyConfigured: !!config.openAiKey
    });
  } catch (error) {
    logger.error({ error }, 'OpenAI test failed');
    res.status(500).json({
      error: 'OpenAI API test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Check that OPENAI_API_KEY is set correctly in your .env file'
    });
  }
});

// Feedback endpoint for chat messages
const feedbackSchema = z.object({
  messageId: z.string().min(1),
  feedback: z.enum(['positive', 'negative']),
  message: z.string().optional(),
  conversationContext: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional()
});

router.post('/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { messageId, feedback, message, conversationContext } = parsed.data;
    const userId = req.user!.id;

    // Store feedback for model improvement
    logger.info({
      userId,
      messageId,
      feedback,
      hasMessage: !!message,
      contextLength: conversationContext?.length || 0
    }, 'Chat message feedback received');

    // RL: Record feedback reward (this is the KEY learning signal)
    personaRL.recordFeedbackReward(
      userId,
      messageId,
      feedback,
      conversationContext
    ).catch(err => {
      logger.warn({ err, userId, messageId }, 'RL: Failed to record feedback reward (non-critical)');
    });

    res.json({
      success: true,
      message: 'Feedback recorded. Thank you for helping us improve!'
    });
  } catch (error) {
    logger.error({ err: error }, 'Feedback endpoint error');
    res.status(500).json({
      error: 'Failed to record feedback',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Action tracking endpoint (for implicit rewards)
const actionSchema = z.object({
  messageId: z.string().min(1),
  actionType: z.enum(['copy', 'source_click', 'regenerate', 'save_entry']),
  metadata: z.record(z.any()).optional()
});

router.post('/action', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { messageId, actionType, metadata } = parsed.data;
    const userId = req.user!.id;

    // RL: Record action-based reward (automatic learning from user behavior)
    personaRL.recordActionReward(
      userId,
      messageId,
      actionType,
      metadata
    ).catch(err => {
      logger.warn({ err, userId, messageId }, 'RL: Failed to record action reward (non-critical)');
    });

    res.json({
      success: true,
      message: 'Action recorded'
    });
  } catch (error) {
    logger.error({ err: error }, 'Action tracking endpoint error');
    res.status(500).json({
      error: 'Failed to record action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const chatRouter = router;
