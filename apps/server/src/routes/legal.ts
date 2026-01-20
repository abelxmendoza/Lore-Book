// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import path from 'path';

import { Router } from 'express';

import { rateLimitMiddleware } from '../middleware/rateLimit';

export const legalRouter = Router();

// Apply rate limiting to prevent DoS attacks on file system access
legalRouter.use(rateLimitMiddleware);

const legalDir = path.resolve(process.cwd(), 'legal');

legalRouter.get('/terms', (_req, res) => {
  res.sendFile(path.join(legalDir, 'TERMS.md'));
});

legalRouter.get('/privacy', (_req, res) => {
  res.sendFile(path.join(legalDir, 'PRIVACY.md'));
});
