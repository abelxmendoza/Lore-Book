import express from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * JSON body-size limits.
 *
 * Chat vision sends up to 4 inline base64 data URLs of up to 6M chars each
 * (see chatImageSchema in routes/chat.ts), so a multi-photo send can approach
 * ~25MB of JSON. The strict global production limit stays in place for every
 * other route; only the chat-send endpoints accept large bodies. Without this,
 * production rejected multi-photo sends before the chat handler ran and the
 * client surfaced "Cloud sync failed".
 */
export const JSON_LIMIT_DEV = '50mb';
export const JSON_LIMIT_PROD_DEFAULT = '1mb';
export const JSON_LIMIT_PROD_CHAT = '26mb';

/** POST endpoints that accept inline chat image attachments. */
const CHAT_VISION_PATHS = new Set(['/api/chat/stream', '/api/chat']);

export function createJsonBodyParser(isDevelopment: boolean) {
  const chatParser = express.json({
    limit: isDevelopment ? JSON_LIMIT_DEV : JSON_LIMIT_PROD_CHAT,
  });
  const defaultParser = express.json({
    limit: isDevelopment ? JSON_LIMIT_DEV : JSON_LIMIT_PROD_DEFAULT,
  });
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && CHAT_VISION_PATHS.has(req.path)) {
      return chatParser(req, res, next);
    }
    return defaultParser(req, res, next);
  };
}
