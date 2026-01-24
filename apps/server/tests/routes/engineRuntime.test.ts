import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/engineRuntime/orchestrator', () => ({
  EngineOrchestrator: vi.fn().mockImplementation(function (this: unknown) {
    return { runAll: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/engineRuntime/storage', () => ({
  getEngineResults: vi.fn().mockResolvedValue({}),
}));

import engineRuntimeRouter from '../../src/routes/engineRuntime';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = mockUser;
  next();
});
app.use('/api/engine-runtime', engineRuntimeRouter);

describe('Engine Runtime API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /summary returns results', async () => {
    const res = await request(app).get('/api/engine-runtime/summary').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /summary/cached returns cached', async () => {
    const res = await request(app).get('/api/engine-runtime/summary/cached').expect(200);
    expect(res.body).toBeDefined();
  });
});
