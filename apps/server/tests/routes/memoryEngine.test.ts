import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/conversationService', () => ({
  conversationService: {
    createSession: vi.fn().mockResolvedValue({ id: 's1' }),
    endSession: vi.fn().mockResolvedValue({ id: 's1' }),
  },
}));
vi.mock('../../src/services/memoryExtractionService', () => ({
  memoryExtractionService: { extractFromSession: vi.fn().mockResolvedValue({ memories: [] }) },
}));
vi.mock('../../src/services/ruleBasedMemoryDetection', () => ({
  ruleBasedMemoryDetectionService: { detect: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/timelineAssignmentService', () => ({
  timelineAssignmentService: { assign: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/jobs/memoryExtractionWorker', () => ({
  memoryExtractionWorker: { enqueue: vi.fn().mockResolvedValue(undefined) },
}));

import { memoryEngineRouter } from '../../src/routes/memoryEngine';

const app = express();
app.use(express.json());
app.use('/api/memory-engine', memoryEngineRouter);

describe('Memory Engine API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /session/start creates session', async () => {
    const res = await request(app).post('/api/memory-engine/session/start').send({}).expect(201);
    expect(res.body).toHaveProperty('session');
  });

  it('POST /session/end ends session', async () => {
    const res = await request(app)
      .post('/api/memory-engine/session/end')
      .send({ sessionId: 's1' })
      .expect(200);
    expect(res.body).toHaveProperty('session');
  });

  it('POST /session/end returns 400 without sessionId', async () => {
    await request(app).post('/api/memory-engine/session/end').send({}).expect(400);
  });
});
