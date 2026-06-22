import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createBackgroundResponse, retrieveBackgroundResponse } from '../services/openaiPlatform/openaiBackgroundResponses';
import { isOpenAiPlatformEnabled, loadOpenAiSessionState } from '../services/openaiPlatform/openaiSessionState';
import { uploadTextToVectorStore } from '../services/openaiPlatform/openaiVectorStoreService';

const router = Router();

/**
 * GET /api/openai-platform/status
 * Read-only feature flags + per-session OpenAI mirror state (admin/dev).
 */
router.get('/status', async (req: AuthenticatedRequest, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  const userId = req.user?.id;

  let sessionState = {};
  if (userId && sessionId) {
    sessionState = await loadOpenAiSessionState(userId, sessionId);
  }

  res.json({
    enabled: isOpenAiPlatformEnabled({
      responseChaining: config.openAiResponseChaining,
      conversationsApi: config.openAiConversationsApi,
      backgroundResponses: config.openAiBackgroundResponses,
      vectorStoreEnabled: config.openAiVectorStoreEnabled,
      useCompactApi: config.openAiUseCompactApi,
      webhookSecret: config.openAiWebhookSecret,
    }),
    flags: {
      responseChaining: config.openAiResponseChaining,
      conversationsApi: config.openAiConversationsApi,
      backgroundResponses: config.openAiBackgroundResponses,
      vectorStoreEnabled: config.openAiVectorStoreEnabled,
      useCompactApi: config.openAiUseCompactApi,
      webhooksConfigured: Boolean(config.openAiWebhookSecret),
      useResponsesApi: config.useResponsesApi,
      useResponsesApiForChat: config.useResponsesApiForChat,
    },
    sessionState,
  });
});

/**
 * POST /api/openai-platform/background
 * Enqueue a long-running OpenAI response (OPENAI_BACKGROUND_RESPONSES=true).
 */
router.post('/background', async (req: AuthenticatedRequest, res) => {
  try {
    const body = z
      .object({
        sessionId: z.string().uuid(),
        input: z.string().min(1).max(12000),
        instructions: z.string().max(4000).optional(),
        model: z.string().optional(),
      })
      .parse(req.body ?? {});

    const job = await createBackgroundResponse({
      userId: req.user!.id,
      sessionId: body.sessionId,
      model: body.model ?? config.chatModel,
      instructions: body.instructions,
      input: body.input,
    });

    res.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Background response failed';
    logger.error({ error }, 'OpenAI background response enqueue failed');
    res.status(message.includes('disabled') ? 503 : 500).json({ error: message });
  }
});

/**
 * GET /api/openai-platform/background/:responseId
 */
router.get('/background/:responseId', async (req: AuthenticatedRequest, res) => {
  try {
    const job = await retrieveBackgroundResponse(req.params.responseId);
    res.json({ success: true, job });
  } catch (error) {
    logger.error({ error, responseId: req.params.responseId }, 'Background response retrieve failed');
    res.status(500).json({ error: 'Failed to retrieve background response' });
  }
});

/**
 * POST /api/openai-platform/vector-store/upload
 * Upload plain text to the session's OpenAI vector store (OPENAI_VECTOR_STORE_ENABLED=true).
 */
router.post('/vector-store/upload', async (req: AuthenticatedRequest, res) => {
  try {
    const body = z
      .object({
        sessionId: z.string().uuid(),
        filename: z.string().min(1).max(200),
        content: z.string().min(1).max(500_000),
      })
      .parse(req.body ?? {});

    const result = await uploadTextToVectorStore({
      userId: req.user!.id,
      sessionId: body.sessionId,
      filename: body.filename,
      content: body.content,
    });

    res.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vector store upload failed';
    logger.error({ error }, 'OpenAI vector store upload failed');
    res.status(message.includes('disabled') ? 503 : 500).json({ error: message });
  }
});

export const openAiPlatformRouter = router;
