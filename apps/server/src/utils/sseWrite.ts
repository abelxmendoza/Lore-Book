import type { Response } from 'express';
import { formatSseDataLine, type ChatStreamEvent } from '@lorebook/api-contracts';

/**
 * Write one chat SSE frame. Prefer typed ChatStreamEvent; Record allowed during migration.
 * Returns false if the client is gone or the write fails.
 */
export function writeChatSseEvent(
  res: Response,
  event: ChatStreamEvent | Record<string, unknown>,
  state?: { clientGone?: boolean },
): boolean {
  if (state?.clientGone || res.writableEnded) return false;
  try {
    res.write(formatSseDataLine(event));
    return true;
  } catch {
    if (state) state.clientGone = true;
    return false;
  }
}

/** Commit standard SSE response headers (call only after pre-stream setup succeeds). */
export function commitChatSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}
