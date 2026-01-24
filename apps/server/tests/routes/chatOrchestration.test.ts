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
vi.mock('../../src/services/conversationalOrchestrationService', () => ({
  conversationalOrchestrationService: {
    handleUserMessage: vi.fn().mockResolvedValue({ text: 'Hi', messageId: 'm1' }),
    getChatHistory: vi.fn().mockResolvedValue([]),
  },
}));

import { chatOrchestrationRouter } from '../../src/routes/chatOrchestration';

const app = express();
app.use(express.json());
app.use('/api/chat/message', chatOrchestrationRouter);

describe('Chat Orchestration API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /message returns response', async () => {
    const res = await request(app)
      .post('/api/chat/message/message')
      .send({ message: 'Hello' })
      .expect(200);
    expect(res.body).toHaveProperty('text');
  });

  it('POST /message returns 400 without message', async () => {
    await request(app).post('/api/chat/message/message').send({}).expect(400);
  });

  it('GET /history/:sessionId returns messages', async () => {
    const res = await request(app).get('/api/chat/message/history/s1').expect(200);
    expect(res.body).toHaveProperty('messages');
  });
});
