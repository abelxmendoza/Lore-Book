// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import fs from 'node:fs';
import path from 'node:path';

import { Router, type Request, type Response } from 'express';

import { renderLegalHtml } from '../lib/legalHtml';
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

function readLegalFile(filename: string): string {
  const filePath = path.join(resolveLegalDir(), filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Legal file missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function wantsMarkdown(req: Request): boolean {
  const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : '';
  if (format === 'md' || format === 'markdown') return true;
  const accept = req.headers.accept ?? '';
  return accept.includes('text/markdown') && !accept.includes('text/html');
}

function sendLegalDocument(req: Request, res: Response, filename: string, title: string) {
  try {
    const markdown = readLegalFile(filename);
    if (wantsMarkdown(req)) {
      res.type('text/markdown; charset=utf-8').send(markdown);
      return;
    }
    res.type('text/html; charset=utf-8').send(renderLegalHtml(title, markdown));
  } catch (error) {
    logger.error({ error, filename }, 'Legal document unavailable');
    res.status(503).json({ error: 'Legal document temporarily unavailable' });
  }
}

legalRouter.get('/terms', rateLimitMiddleware, (req, res) => {
  sendLegalDocument(req, res, 'TERMS.md', 'Terms of Service');
});

legalRouter.get('/privacy', rateLimitMiddleware, (req, res) => {
  sendLegalDocument(req, res, 'PRIVACY.md', 'Privacy Policy');
});
