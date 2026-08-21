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

const compilerHarness = vi.hoisted(() => ({
  compile: vi.fn(),
  actual: null as null | ((opts: unknown) => Promise<unknown>),
}));

vi.mock('../../src/services/responseCompiler/responseCompilerIntegration', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/services/responseCompiler/responseCompilerIntegration')
  >();
  compilerHarness.actual = actual.compileAssistantResponseWithCanon;
  compilerHarness.compile.mockImplementation(actual.compileAssistantResponseWithCanon);
  return {
    ...actual,
    compileAssistantResponseWithCanon: compilerHarness.compile,
  };
});

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
            eq: () => ({
              lt: async () => ({ error: null }),
            }),
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

function parseSseDone(text: string): Record<string, unknown> | null {
  const frames = text.split(/\n\n/).map((block) => block.replace(/^data:\s*/, '').trim());
  for (const frame of frames) {
    if (!frame) continue;
    try {
      const parsed = JSON.parse(frame) as Record<string, unknown>;
      if (parsed.type === 'done') return parsed;
    } catch {
      // skip heartbeat / non-JSON
    }
  }
  return null;
}

describe('POST /api/chat/stream — assistant durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (compilerHarness.actual) {
      compilerHarness.compile.mockImplementation(compilerHarness.actual);
    }
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

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hi', threadId: SESSION_ID });

    expect(assistantUpdates).toHaveLength(0);
    expect(res.text).toContain('"type":"error"');
    expect(res.text).not.toContain('"type":"done"');
  });

  it('returns an SSE error frame when chatStream setup fails after headers commit', async () => {
    vi.mocked(omegaChatService.chatStream).mockRejectedValue(new Error('OpenAI down'));

    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'fail setup', threadId: SESSION_ID });

    // Headers are committed before chatStream() so proxies keep the connection
    // alive during RAG/routing — setup failures arrive as SSE error frames, not JSON.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"type":"error"');
  });

  it('does not rewrite or replace a grounded draft', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Maya said she felt uncomfortable.']),
      content: 'Maya said she felt uncomfortable.',
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-grounded' },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'Maya said she felt uncomfortable.',
        threadId: SESSION_ID,
      });

    const done = parseSseDone(res.text);
    expect(done).toMatchObject({
      type: 'done',
      verified: true,
      rewritten: false,
    });
    expect(done?.content).toBeUndefined();
    expect(assistantUpdates).toHaveLength(1);
    expect(assistantUpdates[0].payload.content).toBe('Maya said she felt uncomfortable.');
    expect(assistantInserts).toHaveLength(1);
  });

  it('persists the disciplined reply and puts the same text on done when rewritten', async () => {
    const draft =
      'Maya overheard a conversation, which contributed to her discomfort and feelings of jealousy.';
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream([draft]),
      content: draft,
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-rewrite' },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'I think Maya was jealous when she saw me talking with Priya.',
        threadId: SESSION_ID,
      });

    const done = parseSseDone(res.text);
    expect(done?.rewritten).toBe(true);
    expect(done?.verified).toBe(true);
    expect(typeof done?.content).toBe('string');
    expect(String(done?.content).toLowerCase()).not.toMatch(/her discomfort and feelings of jealousy/);
    expect(done?.content).toMatch(/user believed/i);
    expect(Number(done?.causalRewriteCount)).toBeGreaterThan(0);
    expect(Number(done?.epistemicRewriteCount)).toBeGreaterThan(0);
    expect(assistantInserts).toHaveLength(1);
    expect(assistantUpdates).toHaveLength(1);
    expect(assistantUpdates[0].payload.content).toBe(done?.content);
  });

  it('keeps the streamed draft and marks verification degraded when compile fails', async () => {
    compilerHarness.compile.mockRejectedValueOnce(new Error('canon down'));
    const draft = 'Maya was jealous, which contributed to the split.';
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream([draft]),
      content: draft,
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-degraded' },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'I think Maya was jealous.',
        threadId: SESSION_ID,
      });

    const done = parseSseDone(res.text);
    expect(done).toMatchObject({
      type: 'done',
      verified: false,
      rewritten: false,
      verificationDegraded: true,
    });
    expect(done?.content).toBeUndefined();
    expect(assistantUpdates[0].payload.content).toBe(draft);
  });

  it('scopes compile to the authenticated tenant', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Jamie works at Vanguard Robotics.']),
      content: 'Jamie works at Vanguard Robotics.',
      metadata: { sessionId: SESSION_ID, messageId: 'user-msg-tenant' },
    } as never);

    await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'Jamie is my coworker at Vanguard Robotics.',
        threadId: SESSION_ID,
      });

    expect(compilerHarness.compile).toHaveBeenCalled();
    const opts = compilerHarness.compile.mock.calls[0]?.[0] as { userId?: string; userMessage?: string };
    expect(opts.userId).toBe('user-durability-1');
    expect(opts.userMessage).toBe('Jamie is my coworker at Vanguard Robotics.');
    expect(opts.userMessage).not.toMatch(/Maya/);
  });
});
