import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { createRateLimiter } from '../middleware/rateLimit';
import { guestChatStream } from '../services/guestChatService';

/** Stricter limit for unauthenticated guest preview — 20 req / 15 min per IP */
const guestRateLimit = createRateLimiter(20);

const guestLoreSchema = z.object({
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string().optional(),
    summary: z.string().optional(),
    alias: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })).max(50).default([]),
  entries: z.array(z.object({
    id: z.string(),
    content: z.string(),
    summary: z.string().optional(),
    date: z.string(),
    tags: z.array(z.string()).optional(),
  })).max(100).default([]),
  locations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    summary: z.string().optional(),
  })).max(30).default([]),
});

const guestStreamSchema = z.object({
  guestId: z.string().min(8).max(64),
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional(),
  guestLore: guestLoreSchema.optional(),
});

const router = Router();

router.post('/stream', guestRateLimit, async (req, res) => {
  req.socket?.setNoDelay(true);

  let clientGone = false;
  res.on('close', () => {
    if (!res.writableEnded) clientGone = true;
  });

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
    const parsed = guestStreamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid guest chat request' });
    }

    const { message, conversationHistory = [], guestLore } = parsed.data;
    const snapshot = guestLore ?? { characters: [], entries: [], locations: [] };

    const { stream, loreUpdates } = await guestChatStream(message, conversationHistory, snapshot);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    sseWrite({
      type: 'metadata',
      data: {
        guestMode: true,
        loreUpdates,
        mentionedEntities: loreUpdates.mentionedEntities,
        characterIds: loreUpdates.mentionedEntities
          .filter((e) => e.type === 'character')
          .map((e) => e.id),
      },
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        if (!sseWrite({ type: 'chunk', content: delta })) break;
      }
    }

    sseWrite({ type: 'done', data: { content: fullResponse } });
    res.end();
  } catch (error) {
    logger.error({ err: error }, 'Guest chat stream error');
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Guest chat failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    sseWrite({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
    res.end();
  }
});

export const guestRouter = router;
