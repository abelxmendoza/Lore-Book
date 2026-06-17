import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const assistantInserts: Record<string, unknown>[] = [];
const assistantUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
let placeholderId = 'placeholder-asst-1';

vi.mock('../../src/services/omegaChatService', () => ({
  omegaChatService: {
    chatStream: vi.fn(),
  },
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
    (req as { user?: { id: string } }).user = { id: 'user-durability-1' };
    next();
  },
  requireAuth: vi.fn(),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'chat_messages' && table !== 'conversation_sessions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: [], error: null })),
        };
      }

      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);

      if (table === 'chat_messages') {
        chain.insert = vi.fn((payload: Record<string, unknown>) => {
          assistantInserts.push(payload);
          return {
            select: () => ({
              single: async () => ({ data: { id: placeholderId }, error: null }),
            }),
          };
        });
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          const id = 'tracked-id';
          assistantUpdates.push({ id, payload });
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        });
        chain.delete = vi.fn().mockReturnValue({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        });
      }

      if (table === 'conversation_sessions') {
        chain.update = vi.fn().mockReturnValue({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        });
      }

      return chain;
    }),
  },
}));

import { chatRouter } from '../../src/routes/chat';
import { omegaChatService } from '../../src/services/omegaChatService';

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

async function* mockStream(chunks: string[]) {
  for (const content of chunks) {
    yield { choices: [{ delta: { content } }] };
  }
}

describe('POST /api/chat/stream — assistant durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantInserts.length = 0;
    assistantUpdates.length = 0;
    placeholderId = `placeholder-${Date.now()}`;
  });

  it('creates assistant placeholder then updates with streamed content', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Hello ', 'world!']),
      content: 'Hello world!',
      metadata: {
        sessionId: SESSION_ID,
        messageId: 'user-msg-1',
      },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'Say hello',
        threadId: SESSION_ID,
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    expect(assistantInserts.length).toBeGreaterThan(0);
    expect(assistantInserts[0]).toMatchObject({
      role: 'assistant',
      session_id: SESSION_ID,
      user_id: 'user-durability-1',
    });
    expect(assistantUpdates.length).toBeGreaterThan(0);
    expect(assistantUpdates[0].payload.content).toBe('Hello world!');
    expect(assistantUpdates[0].payload.metadata).toMatchObject({
      stream_status: 'complete',
      saved_from_stream: true,
    });
    expect(res.text).toContain('"persistence"');
    expect(res.text).toContain('"messageId":"user-msg-1"');
  });

  it('persists partial assistant content when stream yields then ends', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Partial reply']),
      content: 'Partial reply',
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-2' },
    } as never);

    await request(app)
      .post('/api/chat/stream')
      .send({ message: 'test partial', threadId: SESSION_ID });

    expect(assistantUpdates.some((u) => String(u.payload.content).includes('Partial'))).toBe(true);
  });

  it('does not leave placeholder when stream produces empty assistant content', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream([]),
      content: '',
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-3' },
    } as never);

    await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hi', threadId: SESSION_ID });

    expect(assistantUpdates).toHaveLength(0);
  });

  it('returns 500 JSON when chatStream setup fails before headers', async () => {
    vi.mocked(omegaChatService.chatStream).mockRejectedValue(new Error('OpenAI down'));

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'fail setup', threadId: SESSION_ID });

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
