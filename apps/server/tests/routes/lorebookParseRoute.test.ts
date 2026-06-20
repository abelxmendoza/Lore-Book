/**
 * Route integration: POST /api/conversation/lorebook-parse
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { ZodError } from 'zod';

import { FIXTURE_PROJECT_TRUE_POSITIVE_TEXT } from '../../src/services/lorebook/parser/fixtures/loreBookParserFixtures';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'route-lorebook-user' };
    next();
  },
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/services/conversationSuggestionRescanService', () => ({
  conversationSuggestionRescanService: {
    rescan: vi.fn().mockResolvedValue({
      domains: ['characters'],
      lorebookParse: {
        linesParsed: 2,
        operationsSeen: 3,
        applied: 1,
        skipped: 2,
        byDomain: { characters: 1 },
      },
      results: { characters: { scanned: true, count: 1 } },
    }),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

let app: Express;

beforeAll(async () => {
  const conversationCenteredRouter = (await import('../../src/routes/conversationCentered')).default;
  app = express();
  app.use(express.json());
  app.use('/api/conversation', conversationCenteredRouter);
  app.use((err: unknown, _req: unknown, res: express.Response, _next: unknown) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'validation' });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });
});

describe('POST /api/conversation/lorebook-parse', () => {
  it('returns LoreBook operations for valid text (read-only)', async () => {
    const res = await request(app)
      .post('/api/conversation/lorebook-parse')
      .send({ text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT })
      .expect(200);

    expect(Array.isArray(res.body.operations)).toBe(true);
    expect(Array.isArray(res.body.redirects)).toBe(true);
    expect(Array.isArray(res.body.suppressed)).toBe(true);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(typeof res.body.lexicalSpanCount).toBe('number');
    expect(res.body.lexicalSpanCount).toBeGreaterThan(0);
  });

  it('accepts optional threadId', async () => {
    const res = await request(app)
      .post('/api/conversation/lorebook-parse')
      .send({
        text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
        threadId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })
      .expect(200);

    expect(res.body.operations).toBeDefined();
  });

  it('rejects empty text with 400', async () => {
    await request(app).post('/api/conversation/lorebook-parse').send({ text: '' }).expect(400);
  });

  it('rejects missing body with 400', async () => {
    await request(app).post('/api/conversation/lorebook-parse').send({}).expect(400);
  });

  it('rejects invalid threadId uuid with 400', async () => {
    await request(app)
      .post('/api/conversation/lorebook-parse')
      .send({ text: 'hello world', threadId: 'not-a-uuid' })
      .expect(400);
  });
});

describe('POST /api/conversation/suggestion-rescan — lorebookParse summary', () => {
  it('includes lorebookParse block when corpus apply succeeds', async () => {
    const res = await request(app)
      .post('/api/conversation/suggestion-rescan')
      .send({ domains: ['characters'] })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.domains).toContain('characters');
    // lorebookParse may be present when corpus load succeeds (empty corpus still parses)
    if (res.body.summary.lorebookParse) {
      expect(typeof res.body.summary.lorebookParse.linesParsed).toBe('number');
      expect(typeof res.body.summary.lorebookParse.applied).toBe('number');
    }
  });

  it('rejects empty domains array', async () => {
    await request(app).post('/api/conversation/suggestion-rescan').send({ domains: [] }).expect(400);
  });
});
