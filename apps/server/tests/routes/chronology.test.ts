import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/chronology', () => ({
  ChronologyEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ events: [], graph: {} }) };
  }),
  EventMapper: vi.fn().mockImplementation(function (this: unknown) {
    return {
      mapMemoryEntriesToEvents: vi.fn().mockReturnValue([]),
      mapMemoryComponentsToEvents: vi.fn().mockReturnValue([]),
    };
  }),
}));
vi.mock('../../src/services/chronologyV2');
vi.mock('../../src/services/supabaseClient');

import { requireAuth } from '../../src/middleware/auth';
import chronologyRouter from '../../src/routes/chronology';

const app = express();
app.use(express.json());
app.use('/api/chronology', chronologyRouter);

describe('Chronology API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /process with events should return result', async () => {
    const res = await request(app)
      .post('/api/chronology/process')
      .send({ events: [{ id: 'e1' }] })
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
