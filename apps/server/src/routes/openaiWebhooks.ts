import type { Request, Response } from 'express';

import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { handleBackgroundResponseWebhook } from '../services/openaiPlatform/openaiBackgroundResponses';

/**
 * POST /api/webhooks/openai
 * Mounted in index.ts before express.json() with express.raw().
 */
export async function handleOpenAiWebhook(req: Request, res: Response) {
  if (!config.openAiWebhookSecret) {
    return res.status(503).json({ error: 'OpenAI webhooks are not configured' });
  }

  const body = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  try {
    const event = openai.webhooks.unwrap(body, req.headers, config.openAiWebhookSecret);
    await handleBackgroundResponseWebhook(event as {
      type?: string;
      data?: { id?: string; status?: string; error?: { message?: string } };
    });
    return res.json({ received: true });
  } catch (error) {
    logger.warn({ error }, 'OpenAI webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }
}
