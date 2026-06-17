import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/omegaChatService', () => ({
  omegaChatService: {
    chatStream: vi.fn(),
  },
}));

vi.mock('../../src/services/chat/chatMessagePersistenceService', () => ({
  insertAssistantPlaceholder: vi.fn().mockResolvedValue({
    saved: true,
    id: 'placeholder-asst-err',
    role: 'assistant',
  }),
  finalizeAssistantMessage: vi.fn().mockResolvedValue({
    saved: false,
    role: 'assistant',
    error: 'database unavailable',
  }),
  userPersistResult: (messageId?: string) => ({
    saved: !!messageId,
    id: messageId,
    role: 'user' as const,
  }),
}));

vi.mock('../../src/middleware/subscription', () => ({
  checkAiRequestLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/services/usageTracking', () => ({
  incrementAiRequestCount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', () => ({
  optionalAuth: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user?: { id: string } }).user = { id: 'user-persist-err' };
    next();
  },
  requireAuth: vi.fn(),
}));

import { chatRouter } from '../../src/routes/chat';
import { omegaChatService } from '../../src/services/omegaChatService';
import { finalizeAssistantMessage } from '../../src/services/chat/chatMessagePersistenceService';

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

const SESSION_ID = '44444444-4444-4444-8444-444444444444';

async function* mockStream(chunks: string[]) {
  for (const content of chunks) {
    yield { choices: [{ delta: { content } }] };
  }
}

describe('POST /api/chat/stream — persistence error reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Answer text']),
      content: 'Answer text',
      metadata: {
        sessionId: SESSION_ID,
        messageId: 'user-msg-err-1',
      },
    } as never);
  });

  it('emits persistence metadata when assistant finalize fails', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'test', threadId: SESSION_ID });

    expect(res.status).toBe(200);
    expect(finalizeAssistantMessage).toHaveBeenCalled();
    expect(res.text).toContain('"persistence"');
    expect(res.text).toContain('"saved":true');
    expect(res.text).toContain('"saved":false');
    expect(res.text).toContain('database unavailable');
  });
});
