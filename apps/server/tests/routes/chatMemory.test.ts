import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/chat/chatEngine', () => ({
  ChatEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      handleChat: vi.fn().mockResolvedValue({ message: 'ok', metadata: {} }),
      handleChatStream: vi.fn().mockResolvedValue({
        metadata: {},
        stream: (async function* () { yield { choices: [{ delta: { content: 'c' } }] }; })(),
      }),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import chatMemoryRouter from '../../src/routes/chatMemory';

const app = express();
app.use(express.json());
app.use('/api/chat-memory', chatMemoryRouter);

describe('ChatMemory API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST / returns response with valid body', async () => {
    const res = await request(app)
      .post('/api/chat-memory')
      .send({ message: 'hello' })
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });

  it('POST / returns 400 when message missing', async () => {
    await request(app).post('/api/chat-memory').send({}).expect(400);
  });
});
