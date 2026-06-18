/**
 * Route integration: POST /api/lexical/analyze via supertest.
 *
 * Exercises the real lexical analyzer through the HTTP layer (auth, validation,
 * response shape) and the persist branch (mocked pipeline). Happy-path input is
 * drawn from the shared golden corpus so route behaviour stays aligned with the
 * detector-level tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { ZodError } from 'zod';

import { getCorpusCase } from '../fixtures/lexicalOntologyCorpus';

const { mockPipeline } = vi.hoisted(() => ({ mockPipeline: vi.fn() }));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'route-user' };
    next();
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })),
  },
}));

vi.mock('../../src/services/pipeline/loreInterpretationPipeline', () => ({
  runLoreInterpretationPipeline: (...args: unknown[]) => mockPipeline(...args),
}));

let app: Express;

beforeAll(async () => {
  const { lexicalRouter } = await import('../../src/routes/lexical');
  app = express();
  app.use(express.json());
  app.use('/api/lexical', lexicalRouter);
  // Mirror the app's centralized handling of validation errors → 400.
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'validation' });
    res.status(500).json({ error: String(err?.message ?? err) });
  });
});

describe('POST /api/lexical/analyze', () => {
  it('analyzes raw text and returns structured lexical signals', async () => {
    const c = getCorpusCase('skills-org-improving-mainthing');
    const res = await request(app).post('/api/lexical/analyze').send({ text: c.text }).expect(200);

    expect(res.body.rawText).toBe(c.text);
    expect(res.body.userId).toBe('route-user');
    expect(Array.isArray(res.body.skills)).toBe(true);
    expect(res.body.skills.some((s: any) => /ros2/i.test(s.name))).toBe(true);
    expect(res.body.entities.some((e: any) => e.type === 'ORGANIZATION')).toBe(true);
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('rejects empty text with 400', async () => {
    await request(app).post('/api/lexical/analyze').send({ text: '' }).expect(400);
  });

  it('rejects a missing body with 400', async () => {
    await request(app).post('/api/lexical/analyze').send({}).expect(400);
  });

  it('runs the full interpretation pipeline when persist=true', async () => {
    mockPipeline.mockResolvedValueOnce({
      lexical: { messageId: 'm', userId: 'route-user', rawText: 'hi there', entities: [], skills: [] },
      meaning: {},
    });

    const res = await request(app)
      .post('/api/lexical/analyze')
      .send({ text: 'hi there', persist: true })
      .expect(200);

    expect(mockPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'route-user', text: 'hi there' })
    );
    expect(res.body.rawText).toBe('hi there');
  });
});
