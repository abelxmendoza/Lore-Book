import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'path';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/rateLimit', () => ({
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { legalRouter } from '../../src/routes/legal';

const app = express();
app.use('/api/legal', legalRouter);

let origCwd: string;

describe('Legal API Routes', () => {
  beforeAll(() => {
    origCwd = process.cwd();
    process.chdir(path.join(__dirname, '..', '..', '..', '..'));
  });

  afterAll(() => {
    process.chdir(origCwd);
  });

  it('GET /terms should return terms file', async () => {
    const res = await request(app).get('/api/legal/terms').expect(200);
    expect(res.text).toBeDefined();
  });

  it('GET /privacy should return privacy file', async () => {
    const res = await request(app).get('/api/legal/privacy').expect(200);
    expect(res.text).toBeDefined();
  });
});
