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
vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  conversationIngestionPipeline: {
    ingestMessage: vi.fn().mockResolvedValue({
      messageId: 'm1',
      utteranceIds: [],
      unitIds: [],
    }),
  },
}));

import conversationCenteredRouter from '../../src/routes/conversationCentered';
import { conversationIngestionPipeline } from '../../src/services/conversationCentered/ingestionPipeline';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationCenteredRouter);

describe('Conversation API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /ingest returns result', async () => {
    vi.mocked(conversationIngestionPipeline.ingestMessage).mockResolvedValue({
      messageId: 'm1',
      utteranceIds: [],
      unitIds: [],
    });
    const res = await request(app)
      .post('/api/conversation/ingest')
      .set('Content-Type', 'application/json')
      .send({
        thread_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        sender: 'USER',
        raw_text: 'Hello',
      })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message_id');
  });

  it('POST /ingest returns 400 for invalid body', async () => {
    await request(app).post('/api/conversation/ingest').send({}).expect(400);
  });
});
