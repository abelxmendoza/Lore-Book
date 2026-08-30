import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('mid-stream dev-fallback (circuit breaker trips after the user message already saved)', () => {
    const originalDevFallback = process.env.DEV_AI_FALLBACK;
    const originalApiEnv = process.env.API_ENV;

    beforeEach(() => {
      process.env.DEV_AI_FALLBACK = 'true';
      process.env.API_ENV = 'dev';
    });

    afterEach(() => {
      if (originalDevFallback === undefined) delete process.env.DEV_AI_FALLBACK;
      else process.env.DEV_AI_FALLBACK = originalDevFallback;
      if (originalApiEnv === undefined) delete process.env.API_ENV;
      else process.env.API_ENV = originalApiEnv;
    });

    it('reports the user message as saved, not "user_message_not_persisted", when the assistant reply fails mid-stream', async () => {
      // The user's message already persisted before streaming began (real durability
      // payload, exactly like the setup-catch path) — a quota/circuit-breaker error
      // thrown while iterating the stream is an assistant-generation failure only.
      async function* streamThatFailsMidway() {
        yield { choices: [{ delta: { content: 'Partial ' } }] };
        throw new Error('429 quota exceeded');
      }

      vi.mocked(omegaChatService.chatStream).mockResolvedValue({
        stream: streamThatFailsMidway(),
        content: '',
        metadata: {
          sessionId: SESSION_ID,
          messageId: 'user-msg-mid-stream-1',
          durability: {
            userMessage: { id: 'user-msg-mid-stream-1', persisted: true },
            assistantResponse: { status: 'pending' },
            ingestion: { status: 'COMPLETED' },
          },
        },
      } as never);

      const res = await request(app)
        .post('/api/chat/stream')
        .send({ message: 'Kiley Tafur was my ex girlfriend...', threadId: SESSION_ID });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"persistence"');
      // This is the exact regression: the fallback frame must report the user
      // message as saved (it was), never the hardcoded "not persisted" default.
      expect(res.text).not.toContain('user_message_not_persisted');
      expect(res.text).toContain('"role":"user"');
      expect(res.text).toContain('"saved":true');
    });
  });
});
