/**
 * Dev AI Fallback Service
 *
 * When DEV_AI_FALLBACK=true and OpenAI is unavailable (429, timeout, network),
 * this service writes a clearly labelled fake SSE response so UI development
 * can continue without a working OpenAI key.
 *
 * NEVER used in production — see isFallbackEnabled().
 */

import type { Response } from 'express';
import { logger } from '../logger';

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.API_ENV === 'dev';

export function isFallbackEnabled(): boolean {
  if (process.env.DEV_AI_FALLBACK !== 'true') return false;

  // Hard-fail gate: refuse to activate in production.
  // This is checked again at startup in securityCheck.ts, but we guard here too
  // in case the flag is set at runtime.
  if (!isDevelopment) {
    logger.error('[AI] CRITICAL: DEV_AI_FALLBACK=true in production is not allowed. Fallback disabled.');
    return false;
  }

  return true;
}

/** Returns true for OpenAI errors that warrant a fallback response. */
export function isFallbackError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('insufficient_quota') ||
    msg.includes('invalid_api_key') ||
    msg.includes('Incorrect API key') ||
    msg.includes('401') ||
    msg.includes('timeout') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('Failed to connect')
  );
}

// Infer the likely chat mode from the message text so fallback content is useful.
function inferMode(message: string): 'action_log' | 'recall' | 'unknown' {
  const t = message.toLowerCase().trim();
  if (/^(log|save|record|capture|journal entry|memory:|lore note)\b/.test(t)) return 'action_log';
  if (/\b(remember|recall|what do you know|what did i|have i|do you know)\b/.test(t)) return 'recall';
  return 'unknown';
}

function buildFallbackContent(message: string, reason: string): { mode: string; content: string } {
  const mode = inferMode(message);
  const tag = `[DEV FALLBACK — ${reason}]`;

  switch (mode) {
    case 'action_log':
      return {
        mode: 'ACTION_LOG',
        content: `${tag}\n\nLogged locally (dev fallback). In production this entry would be written to Supabase under your user account. Add OpenAI credits to enable full processing.`,
      };
    case 'recall':
      return {
        mode: 'MEMORY_RECALL',
        content: `${tag}\n\nRecall unavailable in dev fallback mode. With a working OpenAI key, I'd search your stored memories and surface relevant entries with dates and confidence scores.`,
      };
    default:
      return {
        mode: 'UNKNOWN',
        content: `${tag}\n\nThis is a dev fallback response — OpenAI is unreachable (${reason}). Your message was received and the mode router classified it as UNKNOWN. The full AI pipeline is intact; only the final OpenAI call is missing.\n\nTo get real responses: add credits at platform.openai.com/account/billing, then restart the server.`,
      };
  }
}

/**
 * Write a complete fake SSE response to the Express Response object.
 *
 * Assumes headers have NOT yet been committed (called from the outer catch
 * in the chat route, before any res.write() has run).
 */
export async function streamFallbackResponse(
  res: Response,
  message: string,
  reason: string
): Promise<void> {
  logger.info(`[AI] DEV_AI_FALLBACK used because: ${reason}`);

  const { mode, content } = buildFallbackContent(message, reason);

  // SSE headers may have been set by setHeader() but not yet committed.
  // Ensure they are correct (idempotent if already set).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Metadata event — marks this as a fallback so the frontend and smoke tests can detect it
  res.write(
    `data: ${JSON.stringify({ type: 'metadata', data: { response_mode: mode, fallback: true, fallback_reason: reason } })}\n\n`
  );

  // Single chunk — no artificial word-by-word delay; this is a dev tool, not a demo
  res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

/**
 * Write a fallback chunk into an already-open SSE stream (inner-catch path).
 * Headers are already committed; we can only write events, not change the status.
 */
export function writeFallbackToOpenStream(
  res: Response,
  message: string,
  reason: string
): void {
  logger.info(`[AI] DEV_AI_FALLBACK used (mid-stream) because: ${reason}`);
  const { content } = buildFallbackContent(message, reason);
  res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}
