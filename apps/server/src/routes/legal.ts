// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import fs from 'node:fs';
import path from 'node:path';

import { Router, type Response } from 'express';

import { rateLimitMiddleware } from '../middleware/rateLimit';
import { logger } from '../logger';

export const legalRouter = Router();

legalRouter.use(rateLimitMiddleware);

function resolveLegalDir(): string {
  const candidates = [
    path.resolve(__dirname, '../legal'), // dist/legal (bundled at build time)
    path.resolve(__dirname, '../../legal'),
    path.resolve(process.cwd(), 'legal'),
    path.resolve(process.cwd(), '../legal'),
    path.resolve(__dirname, '../../../../legal'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'TERMS.md'))) {
      return dir;
    }
  }

  throw new Error(`Legal documents not found. Checked: ${candidates.join(', ')}`);
}

function sendLegalFile(res: Response, filename: string) {
  try {
    const filePath = path.join(resolveLegalDir(), filename);
    if (!fs.existsSync(filePath)) {
      logger.error({ filePath, filename }, 'Legal document file missing on disk');
      res.status(503).json({ error: 'Legal document temporarily unavailable' });
      return;
    }
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error({ err, filePath, filename }, 'Failed to send legal document');
        if (!res.headersSent) {
          res.status(503).json({ error: 'Legal document temporarily unavailable' });
        }
      }
    });
  } catch (error) {
    logger.error({ error, filename }, 'Legal document unavailable');
    res.status(503).json({ error: 'Legal document temporarily unavailable' });
  }
}

legalRouter.get('/terms', rateLimitMiddleware, (_req, res) => {
  sendLegalFile(res, 'TERMS.md');
});

legalRouter.get('/privacy', rateLimitMiddleware, (_req, res) => {
  sendLegalFile(res, 'PRIVACY.md');
});
