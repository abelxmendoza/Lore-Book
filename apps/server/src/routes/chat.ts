import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimitMiddleware, createRateLimiter } from '../middleware/rateLimit';
import { checkAiRequestLimit } from '../middleware/subscription';
import { omegaChatService } from '../services/omegaChatService';
import { ChatPersonaRL } from '../services/reinforcementLearning/chatPersonaRL';
import { incrementAiRequestCount } from '../services/usageTracking';
import { isFallbackEnabled, isFallbackError, streamFallbackResponse, writeFallbackToOpenStream } from '../services/devFallbackService';
import { memoryFeedbackBus } from '../services/memoryFeedbackBus';

// AI endpoints get their own stricter limit: 30 req/15min in prod, unlimited in dev
const aiRateLimit = createRateLimiter(30);

const personaRL = new ChatPersonaRL();

const router = Router();

const currentContextSchema = z.object({
  kind: z.enum(['none', 'timeline', 'thread']),
  timelineNodeId: z.string().uuid().optional(),
  timelineLayer: z.enum(['era', 'saga', 'arc', 'chapter']).optional(),
  threadId: z.string().uuid().optional()
}).optional();

const soulProfileContextSchema = z.object({
  lastReferencedInsightId: z.string().optional(),
  lastSurfacedInsights: z.array(z.object({
    id: z.string(),
    category: z.string(),
    text: z.string(),
    confidence: z.number()
  })).optional()
}).optional();

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000)
  })).max(50).optional(),
  stream: z.boolean().optional().default(false),
  threadId: z.string().uuid().optional(),
  entityContext: z.object({
    type: z.enum(['CHARACTER', 'LOCATION', 'PERCEPTION', 'MEMORY', 'ENTITY', 'GOSSIP']),
    id: z.string().uuid()
  }).optional(),
  currentContext: currentContextSchema,
  soulProfileContext: soulProfileContextSchema,
  threadEntities: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['character', 'location', 'organization']),
  })).max(20).optional(),
  composerEntities: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['character', 'location', 'organization', 'skill', 'event']),
  })).max(15).optional(),
});

// If the client supplied a threadId but no thread context, derive it so the
// RAG builder takes the thread-scoped + cross-thread entity retrieval path.
function resolveThreadContext(
  threadId: string | undefined,
  currentContext: z.infer<typeof currentContextSchema>
): z.infer<typeof currentContextSchema> {
  if (threadId && (!currentContext || currentContext.kind === 'none')) {
    return { kind: 'thread', threadId };
  }
  return currentContext;
}

// Streaming endpoint
router.post('/stream', aiRateLimit, optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  // Disable Nagle's algorithm so SSE chunks reach the client immediately without buffering.
  req.socket?.setNoDelay(true);

  // Track whether the client closed the connection before we finished writing.
  let clientGone = false;
  req.on('close', () => { clientGone = true; });

  // Safe write helper — no-ops if client disconnected or response already ended.
  const sseWrite = (payload: object): boolean => {
    if (clientGone || res.writableEnded) return false;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      return true;
    } catch {
      clientGone = true;
      return false;
    }
  };

  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], threadId, entityContext, soulProfileContext, threadEntities, composerEntities } = parsed.data;
    const currentContext = resolveThreadContext(threadId, parsed.data.currentContext);
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    // Resolve the chat stream BEFORE committing SSE headers.
    // If chatStream() throws (OpenAI quota, DB error, etc.) we can still return a
    // proper JSON error response instead of sending a broken SSE stream.
    let result: Awaited<ReturnType<typeof omegaChatService.chatStream>>;
    try {
      result = await omegaChatService.chatStream(userId, message, conversationHistory, entityContext, currentContext, soulProfileContext, threadId, threadEntities, composerEntities);
    } catch (setupError) {
      if (isFallbackEnabled() && isFallbackError(setupError)) {
        const reason = (setupError instanceof Error && setupError.message.includes('429'))
          ? 'OpenAI 429 quota exceeded'
          : `OpenAI error: ${setupError instanceof Error ? setupError.message.substring(0, 60) : 'unknown'}`;
        const msgForFallback = (req.body as { message?: string })?.message ?? '';
        // Headers not yet sent — streamFallbackResponse will set them.
        await streamFallbackResponse(res, msgForFallback, reason);
      } else {
        logger.error({ err: setupError }, 'Chat stream setup error');
        // Headers not yet committed — safe to send JSON.
        res.status(500).json({
          error: 'Failed to process chat message',
          message: setupError instanceof Error ? setupError.message : 'Unknown error',
        });
      }
      return;
    }

    // chatStream() succeeded — now commit SSE headers and begin streaming.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Increment usage count (fire and forget)
    incrementAiRequestCount(userId).catch(err =>
      logger.warn({ error: err }, 'Failed to increment AI request count')
    );

    // Pending entity questions are NOT injected into chat responses here.
    // They created cross-thread noise (e.g. a global "Fairy" question appearing
    // during an unrelated LoreBook dev thread). Real-time ambiguity is handled
    // inline in omegaChatService when the user's current message mentions a
    // gray-zone name. Async ingestion queues questions for the Characters Book
    // suggestions UI instead — see characterSuggestionService.
    sseWrite({ type: 'metadata', data: result.metadata });

    try {
      let fullResponse = '';
      for await (const chunk of result.stream) {
        if (clientGone) break;
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          sseWrite({ type: 'chunk', content });
        }
      }
      if (!clientGone) {
        sseWrite({ type: 'done' });
        res.end();
      }
      // Advisory hallucination guard — never blocks the stream; flags
      // responses that claim memory about names absent from the entity graph.
      if (fullResponse.length > 0 && req.user?.id) {
        import('../services/chat/memoryClaimGuard')
          .then(({ verifyMemoryClaims }) => verifyMemoryClaims(req.user!.id, fullResponse))
          .catch(() => {});
      }
    } catch (streamError) {
      // Mid-stream failure — headers committed, can only write an error event.
      if (isFallbackEnabled() && isFallbackError(streamError)) {
        writeFallbackToOpenStream(res, message, streamError instanceof Error ? streamError.message : 'stream error');
      } else {
        logger.error({ error: streamError }, 'Chat stream mid-stream error');
        sseWrite({ type: 'error', error: streamError instanceof Error ? streamError.message : 'Unknown stream error' });
        if (!res.writableEnded) res.end();
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Chat stream unhandled error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else if (!res.writableEnded) {
      sseWrite({ type: 'error', error: 'Internal server error' });
      res.end();
    }
  }
});

// Non-streaming endpoint (fallback)
router.post('/', aiRateLimit, optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], stream, threadId, entityContext, soulProfileContext } = parsed.data;
    const currentContext = resolveThreadContext(threadId, parsed.data.currentContext);
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    // If streaming requested but endpoint is /, redirect to /stream
    if (stream) {
      return res.status(400).json({ error: 'Use /api/chat/stream for streaming' });
    }

    const result = await omegaChatService.chat(userId, message, conversationHistory, entityContext, currentContext, soulProfileContext, threadId);

    // Increment usage count (fire and forget)
    incrementAiRequestCount(userId).catch(err => 
      logger.warn({ error: err }, 'Failed to increment AI request count')
    );

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (isFallbackEnabled() && isFallbackError(error)) {
      const reason = error instanceof Error ? error.message.substring(0, 80) : 'OpenAI unavailable';
      return res.json({
        answer: `[DEV FALLBACK — ${reason}]\n\nDev fallback active. Full AI pipeline intact; only the final OpenAI call is missing. Add a valid OPENAI_API_KEY to get real responses.`,
        timestamp: new Date().toISOString(),
        fallback: true,
      });
    }
    logger.error({ err: error }, 'Chat endpoint error');
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test OpenAI connection endpoint
router.get('/test-openai', rateLimitMiddleware, optionalAuth, async (_req: AuthenticatedRequest, res) => {
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
      model: config.defaultModel || 'gpt-5.4-mini',
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

// Long-poll: client waits up to 8s for the ingestion pipeline to finish for a given message.
// Returns the memory feedback event or 204 (no content) on timeout.
router.get('/memory-feedback/:messageId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { messageId } = req.params;
  const userId = req.user!.id;

  const feedback = await memoryFeedbackBus.waitFor(messageId, 8000);

  if (!feedback) {
    return res.status(204).end();
  }

  if (feedback.userId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(feedback);
});

export const chatRouter = router;
