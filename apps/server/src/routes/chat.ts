import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { StorageBlockedError } from '../utils/postgresError';
import { shouldBlockAnonymousAiChat } from '../config/runtimePolicy';
import { openAiHttpBurstLimit, openAiHttpLimit, requireDevToolingAccess } from '../middleware/apiProtection';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth';
import { checkAiRequestLimit } from '../middleware/subscription';
import { omegaChatService } from '../services/omegaChatService';
import { ChatPersonaRL } from '../services/reinforcementLearning/chatPersonaRL';
import { incrementAiRequestCount } from '../services/usageTracking';
import { isFallbackEnabled, isFallbackError, streamFallbackResponse, writeFallbackToOpenStream } from '../services/devFallbackService';
import { memoryFeedbackBus } from '../services/memoryFeedbackBus';
import { loreBookNoticeBus } from '../services/lorebook/parser/loreBookNoticeBus';
import { messageCorrectionService } from '../services/messageCorrectionService';
import {
  insertAssistantPlaceholder,
  finalizeAssistantMessage,
  userPersistResult,
  type MessagePersistResult,
} from '../services/chat/chatMessagePersistenceService';
import { buildAssistantPersistMetadata } from '../services/chat/assistantPersistMetadata';
import {
  parseChatCompletionStreamChunk,
  type ChatStreamTokenUsage,
} from '../services/chat/chatStreamChunk';
import {
  listMentionableEntities,
  sanitizeComposerEntities,
} from '../services/entities/entityMentionIndexService';

const personaRL = new ChatPersonaRL();

const router = Router();

function sendAnonymousAiBlocked(res: import('express').Response) {
  return res.status(403).json({
    error: 'Guest chat is simulation-only in production',
    message: 'Use /api/guest/stream for unauthenticated guest preview chat, or sign in to use the full AI chat pipeline.',
  });
}

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

const chatFocusSchema = z.object({
  entityId: z.string().min(1),
  entityName: z.string(),
  entityType: z.enum(['character', 'location', 'organization', 'project', 'skill', 'relationship', 'quest', 'event', 'memory']),
  sourceSurface: z.string(),
  sourceLabel: z.string(),
  relationshipId: z.string().optional(),
  relationshipName: z.string().optional(),
  knowledgeScope: z.string().optional(),
  initialPrompt: z.string().optional(),
  sessionStats: z.object({
    messagesSent: z.number(),
    connectionDelta: z.number(),
    affectionDelta: z.number(),
    lastUpdatedAt: z.string().optional(),
  }).optional(),
  baseline: z.object({
    affectionScore: z.number().optional(),
    connectionScore: z.number().optional(),
    healthScore: z.number().optional(),
  }).optional(),
}).optional();

const chatImageSchema = z.object({
  dataUrl: z
    .string()
    .min(32)
    .max(6_000_000)
    .regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i, 'Invalid image data URL'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).optional(),
  detail: z.enum(['low', 'high', 'original', 'auto']).optional(),
});

const chatSchema = z
  .object({
    message: z.string().max(5000).default(''),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        }),
      )
      .max(50)
      .optional(),
    stream: z.boolean().optional().default(false),
    threadId: z.string().uuid().optional(),
    entityContext: z
      .object({
        type: z.enum([
          'CHARACTER',
          'LOCATION',
          'PERCEPTION',
          'MEMORY',
          'ENTITY',
          'GOSSIP',
          'ROMANTIC_RELATIONSHIP',
        ]),
        id: z.string().min(1),
      })
      .optional(),
    chatFocus: chatFocusSchema,
    currentContext: currentContextSchema,
    soulProfileContext: soulProfileContextSchema,
    threadEntities: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          type: z.enum(['character', 'location', 'organization', 'skill']),
        }),
      )
      .max(20)
      .optional(),
    composerEntities: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          type: z.enum(['character', 'location', 'organization', 'skill', 'event']),
          status: z.enum(['confirmed', 'suggestion']).optional(),
        }),
      )
      .max(15)
      .optional(),
    previewCorrections: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
          start: z.number(),
          end: z.number(),
          originalType: z.string(),
          correctedType: z.string().optional(),
          originalSubtype: z.string().optional(),
          correctedSubtype: z.string().optional(),
          entityStatus: z.enum(['known', 'new', 'ignored', 'wrong', 'confirmed']),
          linkedEntityId: z.string().optional(),
          linkedEntityName: z.string().optional(),
          linkedEntityType: z.string().optional(),
          parentEntityId: z.string().optional(),
          parentEntityName: z.string().optional(),
          parentEntityType: z.string().optional(),
          displayNameOverride: z.string().optional(),
          correctionAction: z.string(),
          confidence: z.number().optional(),
          confidenceOverride: z.number().optional(),
          sensitive: z.boolean().optional(),
          requiresReview: z.boolean().optional(),
          userConfirmed: z.boolean().optional(),
          correctionSource: z.enum(['composer', 'chat_chip', 'review_page']),
        }),
      )
      .max(50)
      .optional(),
    /** Inline vision attachments for this turn (max 4). Not re-sent on later turns. */
    images: z.array(chatImageSchema).max(4).optional(),
  })
  .refine((data) => data.message.trim().length > 0 || (data.images?.length ?? 0) > 0, {
    message: 'Message text or an image is required',
    path: ['message'],
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

import { isOpenAiBudgetExceededError } from '../services/openaiBudgetService';
import { beginMessageCost, flushMessageCost, getMessageCost } from '../lib/messageCostTracker';
import {
  detectFirstSessionCallback,
  shouldRunFirstSessionCallback,
} from '../services/chat/firstSessionContinuity';

function isOpenAIQuotaError(error: unknown): boolean {
  if (isOpenAiBudgetExceededError(error)) return true;
  const err = error as { code?: string; message?: string } | null;
  const text = err?.message ?? (error instanceof Error ? error.message : String(error));
  return (
    err?.code === 'openai_circuit_open' ||
    err?.code === 'openai_budget_exceeded' ||
    /429|insufficient_quota|quota exceeded|circuit breaker open|monthly openai budget/i.test(text)
  );
}

// Streaming endpoint
router.post('/stream', openAiHttpLimit, openAiHttpBurstLimit, optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  // Disable Nagle's algorithm so SSE chunks reach the client immediately without buffering.
  req.socket?.setNoDelay(true);

  // Track whether the client closed the connection before we finished writing.
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableEnded) clientGone = true;
  });

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

    const {
      message,
      conversationHistory = [],
      threadId,
      entityContext,
      chatFocus,
      soulProfileContext,
      threadEntities,
      composerEntities,
      previewCorrections,
      images,
    } = parsed.data;
    const currentContext = resolveThreadContext(threadId, parsed.data.currentContext);
    if (shouldBlockAnonymousAiChat(req.user)) {
      return sendAnonymousAiBlocked(res);
    }
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    let validatedComposerEntities = composerEntities;
    if (composerEntities?.length && req.user?.id) {
      try {
        const index = await listMentionableEntities(req.user.id);
        const sanitized = sanitizeComposerEntities(message, composerEntities, index);
        validatedComposerEntities = sanitized.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          status: e.status,
        }));
        if (sanitized.length < composerEntities.length) {
          logger.info(
            { userId, submitted: composerEntities.length, kept: sanitized.length },
            'Composer entities sanitized against mention index'
          );
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Composer entity validation failed; ignoring submitted entities');
        validatedComposerEntities = undefined;
      }
    }

    // Begin per-message cost accounting (Launch-Readiness Step 1: MEASURE).
    // Set before chatStream so the AsyncLocalStorage context spans the decorator
    // fan-out and the streamed answer; flushed once after the stream is consumed.
    beginMessageCost({ label: 'chat', userId });

    // Resolve the chat stream BEFORE committing SSE headers.
    // If chatStream() throws (OpenAI quota, DB error, etc.) we can still return a
    // proper JSON error response instead of sending a broken SSE stream.
    let result: Awaited<ReturnType<typeof omegaChatService.chatStream>>;
    try {
      result = await omegaChatService.chatStream(
        userId,
        message,
        conversationHistory,
        entityContext,
        currentContext,
        soulProfileContext,
        threadId,
        threadEntities,
        validatedComposerEntities,
        chatFocus ?? undefined,
        previewCorrections,
        images,
      );
      const mc = getMessageCost();
      if (mc) mc.messageId = result.metadata.messageId;
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
        if (isOpenAiBudgetExceededError(setupError)) {
          const budgetErr = setupError as { userMessage?: string; budget?: unknown };
          res.status(403).json({
            error: 'openai_budget_exceeded',
            code: 'openai_budget_exceeded',
            stage: 'response_generation',
            userMessage: budgetErr.userMessage,
            budget: budgetErr.budget,
          });
          return;
        }
        if (isOpenAIQuotaError(setupError)) {
          res.status(429).json({
            error: 'OpenAI quota exhausted',
            stage: 'response_generation',
            memory: {
              user_message_saved: false,
              ingestion_started: false,
              entity_creation_started: false,
              assistant_message_saved: false,
            },
            userMessage:
              'Response generation failed because the OpenAI quota is exhausted. This failed before server-side memory ingestion, so I did not create or update memories from this send.',
          });
          return;
        }
        if (setupError instanceof StorageBlockedError) {
          res.status(setupError.statusCode).json({
            error: setupError.message,
            code: setupError.apiCode,
            stage: 'message_persistence',
            memory: {
              user_message_saved: false,
              ingestion_started: false,
              entity_creation_started: false,
              assistant_message_saved: false,
            },
            userMessage: setupError.message,
          });
          return;
        }
        // Headers not yet committed — safe to send JSON.
        res.status(500).json({
          error: 'Failed to process chat message',
          stage: 'response_generation',
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

    // ── Durable assistant persistence ──────────────────────────────────────────
    let fullResponse = '';
    let streamTokenUsage: ChatStreamTokenUsage | null = null;
    const persistSessionId = result.metadata.sessionId ?? threadId ?? null;
    let assistantRowId: string | null = null;
    let assistantPersistResult: MessagePersistResult | null = null;

    const emitPersistence = (patch: {
      user?: MessagePersistResult;
      assistant?: MessagePersistResult;
    }) => {
      sseWrite({
        type: 'metadata',
        data: {
          persistence: {
            user: patch.user ?? userPersistResult(result.metadata.messageId),
            assistant: patch.assistant,
          },
        },
      });
    };

    emitPersistence({
      user: userPersistResult(result.metadata.messageId),
      assistant: { saved: false, role: 'assistant' },
    });

    if (req.user?.id && persistSessionId) {
      const placeholder = await insertAssistantPlaceholder(req.user.id, persistSessionId);
      if (placeholder.saved && placeholder.id) {
        assistantRowId = placeholder.id;
        result.metadata.assistantMessageId = placeholder.id;
        sseWrite({ type: 'metadata', data: { assistantMessageId: placeholder.id } });
      } else {
        logger.warn(
          { err: placeholder.error, sessionId: persistSessionId },
          'Assistant placeholder insert failed — will insert on complete'
        );
      }
    }

    const persistAssistant = async (status: 'complete' | 'partial' | 'failed'): Promise<void> => {
      if (!req.user?.id || !persistSessionId) return;
      assistantPersistResult = await finalizeAssistantMessage({
        userId: req.user.id,
        sessionId: persistSessionId,
        assistantRowId,
        content: fullResponse,
        metadata: buildAssistantPersistMetadata({
          sources: result.metadata.sources,
          connections: result.metadata.connections,
          continuityWarnings: result.metadata.continuityWarnings,
          response_mode: result.metadata.response_mode,
          recall_sources: result.metadata.recall_sources,
          mentionedEntities: result.metadata.mentionedEntities,
          characterIds: result.metadata.characterIds,
          creationOutcomes: result.metadata.creationOutcomes,
          creationOutcomeSummary: result.metadata.creationOutcomeSummary,
          staleProjectionHints: result.metadata.staleProjectionHints,
          staleProjectionSummary: result.metadata.staleProjectionSummary,
          ...(streamTokenUsage ? { tokenUsage: streamTokenUsage } : {}),
        }),
        status,
      });
      if (assistantPersistResult.id) {
        result.metadata.assistantMessageId = assistantPersistResult.id;
      }
      emitPersistence({
        user: userPersistResult(result.metadata.messageId),
        assistant: assistantPersistResult,
      });
    };

    let streamResponseId: string | undefined;
    try {
      for await (const chunk of result.stream) {
        if (clientGone) break;
        const { contentDelta, usage, responseId } = parseChatCompletionStreamChunk(chunk);
        if (usage) streamTokenUsage = usage;
        if (responseId) streamResponseId = responseId;
        if (contentDelta) {
          fullResponse += contentDelta;
          sseWrite({ type: 'chunk', content: contentDelta });
        }
      }
      await persistAssistant(clientGone ? 'partial' : 'complete');
      if (streamResponseId && req.user?.id && persistSessionId) {
        const { mergeOpenAiSessionState } = await import('../services/openaiPlatform/openaiSessionState');
        await mergeOpenAiSessionState(req.user.id, persistSessionId, {
          last_response_id: streamResponseId,
        });
      }
      let responseCompilerMeta: Record<string, unknown> | undefined;
      if (fullResponse.length > 0 && req.user?.id) {
        try {
          const { compileAssistantResponseWithCanon } = await import(
            '../services/responseCompiler/responseCompilerIntegration'
          );
          const compiled = await compileAssistantResponseWithCanon({
            userId: req.user.id,
            rawResponse: fullResponse,
            userMessage: message,
            userMessageId: result.metadata.messageId,
            conversationHistory,
          });
          responseCompilerMeta = {
            actionCandidates: compiled.actionCandidates,
            certaintyScore: compiled.certaintyScore,
            groundedCount: compiled.groundedClaims.length,
            inferredCount: compiled.inferredClaims.length,
            unsupportedCount: compiled.unsupportedClaims.length,
            contradictionCount: compiled.contradictions.length,
            memoryCandidatesBlocked: compiled.memoryCandidatesBlocked.length,
          };
        } catch (compileErr) {
          logger.warn({ err: compileErr, userId: req.user.id }, 'Response compiler failed (non-blocking)');
        }
      }
      // Emit one `message.cost` line for this message (LLM/embedding calls,
      // tokens, est. USD, duration) now that the answer stream is fully consumed.
      const costSummary = flushMessageCost();

      // First-session "aha": deterministically surface when this message recalls
      // something the user said earlier in the session, with provenance. Cheap,
      // synchronous, no LLM — fires only in the early-session window.
      let continuityCallback;
      if (shouldRunFirstSessionCallback(conversationHistory?.length ?? 0)) {
        const priorUserMessages = (conversationHistory ?? [])
          .filter((m) => m.role === 'user')
          .map((m) => m.content);
        continuityCallback = detectFirstSessionCallback(message, priorUserMessages) ?? undefined;
      }

      if (!res.writableEnded) {
        if (!clientGone) {
          sseWrite({
            type: 'done',
            ...(streamTokenUsage ? { usage: streamTokenUsage } : {}),
            ...(responseCompilerMeta ? { responseCompiler: responseCompilerMeta } : {}),
            ...(costSummary ? { cost: costSummary } : {}),
            ...(continuityCallback ? { continuityCallback } : {}),
          });
        }
        res.end();
      }
      if (fullResponse.length > 0 && req.user?.id) {
        import('../services/chat/memoryClaimGuard')
          .then(({ verifyMemoryClaims }) => verifyMemoryClaims(req.user!.id, fullResponse))
          .catch(() => {});
      }
    } catch (streamError) {
      // Mid-stream failure: persist whatever we got so the assistant turn is never lost.
      await persistAssistant('partial');
      // Mid-stream failure — headers committed, can only write an error event.
      if (isFallbackEnabled() && isFallbackError(streamError)) {
        writeFallbackToOpenStream(res, message, streamError instanceof Error ? streamError.message : 'stream error');
      } else {
        logger.error({ error: streamError }, 'Chat stream mid-stream error');
        const error = isOpenAIQuotaError(streamError)
          ? 'Response generation stopped because the OpenAI quota is exhausted. Your user message may have been saved, but this assistant reply is incomplete.'
          : streamError instanceof Error ? streamError.message : 'Unknown stream error';
        sseWrite({ type: 'error', error });
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
router.post('/', openAiHttpLimit, openAiHttpBurstLimit, optionalAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const { message, conversationHistory = [], stream, threadId, entityContext, soulProfileContext } = parsed.data;
    const currentContext = resolveThreadContext(threadId, parsed.data.currentContext);
    if (shouldBlockAnonymousAiChat(req.user)) {
      return sendAnonymousAiBlocked(res);
    }
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
router.get('/test-openai', requireDevToolingAccess, openAiHttpLimit, requireAuth, async (_req: AuthenticatedRequest, res) => {
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

// Long-poll: LoreBook ingest parse notice after a user message (only when seeds applied).
router.get('/lorebook-notice/:messageId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { messageId } = req.params;
  const userId = req.user!.id;

  const notice = await loreBookNoticeBus.waitFor(messageId, 8000);

  if (!notice) {
    return res.status(204).end();
  }

  if (notice.userId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(notice);
});

/**
 * Correct one of the user's own chat messages.
 * Versions the message (history preserved), tombstones the knowledge derived
 * from the old text, and re-ingests the corrected text so what Lore Book
 * "knows" updates to match.
 */
const correctMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  reason: z.string().max(1000).optional(),
});

router.patch('/messages/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const messageId = req.params.id as string;

  const parsed = correctMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid correction', details: parsed.error.flatten() });
  }

  try {
    const result = await messageCorrectionService.correctMessage(
      userId,
      messageId,
      parsed.data.content,
      parsed.data.reason
    );
    return res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to correct message';
    const status = msg === 'Message not found' ? 404
      : msg === 'Only user messages can be corrected' ? 422
      : 400;
    logger.warn({ err: error, userId, messageId }, 'Message correction failed');
    return res.status(status).json({ error: msg });
  }
});

/** Full edit history of a message (newest first). */
router.get('/messages/:id/revisions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const messageId = req.params.id as string;
  const revisions = await messageCorrectionService.getRevisions(userId, messageId);
  return res.json({ revisions });
});

export const chatRouter = router;
