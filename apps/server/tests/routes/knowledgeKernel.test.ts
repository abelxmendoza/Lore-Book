import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((req, _res, next) => {
    req.user = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    next();
  }),
}));

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import knowledgeKernelRouter from '../../src/routes/knowledgeKernel';
import { chainableQuery } from '../fixtures/cognitionSupabaseMock';

const app = express();
app.use(express.json());
app.use('/api/knowledge-kernel', knowledgeKernelRouter);

describe('Knowledge Kernel read routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_KNOWLEDGE_KERNEL_READS = 'true';
  });

  it('returns 503 while kernel reads are disabled', async () => {
    process.env.ENABLE_KNOWLEDGE_KERNEL_READS = 'false';
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const response = await request(app).get('/api/knowledge-kernel/summary').expect(503);

    process.env.NODE_ENV = previousNodeEnv;
    expect(response.body.code).toBe('KNOWLEDGE_KERNEL_DISABLED');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('summarizes review, challenge, stance, and recent activity counts', async () => {
    mockFrom.mockReturnValue(chainableQuery({
      data: [
        {
          status: 'proposed',
          epistemic_stance: 'user_belief',
          domain: 'relationship',
          sensitivity: 'sensitive',
          recorded_at: new Date().toISOString(),
        },
        {
          status: 'challenged',
          epistemic_stance: 'system_hypothesis',
          domain: 'identity',
          sensitivity: 'standard',
          recorded_at: '2020-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    }));

    const response = await request(app).get('/api/knowledge-kernel/summary').expect(200);

    expect(response.body.summary).toMatchObject({
      total: 2,
      needs_review: 1,
      challenged: 1,
      recently_changed: 1,
      by_stance: { user_belief: 1, system_hypothesis: 1 },
    });
  });

  it('reports an unavailable schema distinctly from an empty graph', async () => {
    mockFrom.mockReturnValue(chainableQuery({
      data: null,
      error: { code: 'PGRST205', message: 'table missing' },
    }));

    const response = await request(app).get('/api/knowledge-kernel/assertions').expect(503);

    expect(response.body.code).toBe('KNOWLEDGE_KERNEL_UNAVAILABLE');
  });
});
