import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user?: { id: string } }).user = { id: 'user-threads-1' };
    next();
  },
}));

const mockLoadThreadMessages = vi.fn();
const mockGetLinkedSessionIds = vi.fn().mockResolvedValue([]);

vi.mock('../../src/services/conversationCentered/threadContentService', () => ({
  loadThreadMessages: (...args: unknown[]) => mockLoadThreadMessages(...args),
  getLinkedSessionIds: (...args: unknown[]) => mockGetLinkedSessionIds(...args),
  isThreadProtected: vi.fn().mockResolvedValue(true),
  recoverOrphanSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/services/conversationCentered/threadIntelligenceService', () => ({
  threadIntelligenceService: { syncFromStoredMessages: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/services/conversationCentered/threadDedupeService', () => ({
  dedupeUserConversationThreads: vi.fn().mockResolvedValue({ deleted: 0, titlesUpdated: 0 }),
  findReusableEmptyDraft: vi.fn().mockResolvedValue(null),
  ensureUniqueThreadTitle: vi.fn(async (_u: string, _id: string, title: string) => title),
}));

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import conversationRouter from '../../src/routes/conversationCentered';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationRouter);

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('Conversation threads API — message durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /threads/:id/messages returns full user+assistant conversation', async () => {
    mockLoadThreadMessages.mockResolvedValue([
      {
        id: 'u1',
        role: 'user',
        content: 'Tell me about Jerry',
        created_at: '2026-06-01T00:00:00Z',
        metadata: null,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Jerry was an early collaborator.',
        created_at: '2026-06-01T00:00:01Z',
        metadata: { saved_from_stream: true },
      },
    ]);

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: SESSION_ID, title: 'Test', updated_at: '2026-06-01T00:00:00Z', metadata: {} },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(app)
      .get(`/api/conversation/threads/${SESSION_ID}/messages`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[1].role).toBe('assistant');
    expect(mockLoadThreadMessages).toHaveBeenCalledWith('user-threads-1', SESSION_ID);
  });

  it('GET /threads returns pagination metadata', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.or = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockResolvedValue({ data: [], error: null });
    Object.assign(chain, {
      then(onFulfilled: (v: unknown) => unknown) {
        return Promise.resolve(
          onFulfilled({
            data: [
              {
                id: SESSION_ID,
                title: 'Jerry thread',
                updated_at: '2026-06-02T00:00:00Z',
                metadata: {},
              },
            ],
            count: 1,
            error: null,
          })
        );
      },
    });

    mockFrom.mockReturnValue(chain);

    const res = await request(app).get('/api/conversation/threads?limit=30').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.threads).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(typeof res.body.hasMore).toBe('boolean');
  });

  it('loads exact message counts in one batched read per message store', async () => {
    const rows = [
      {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        title: 'Canonical thread',
        updated_at: '2026-08-05T12:00:00.000Z',
        metadata: {},
      },
      {
        id: 'bbbbbbbb-0000-4000-8000-000000000002',
        title: 'Legacy thread',
        updated_at: '2026-08-05T11:00:00.000Z',
        metadata: {},
      },
    ];

    const sessionsChain: Record<string, unknown> = {};
    sessionsChain.select = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.eq = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.order = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.limit = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.or = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(onFulfilled({ data: rows, count: rows.length, error: null }));

    const messageChain = (data: Array<{ session_id: string }>) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.range = vi.fn().mockResolvedValue({ data, error: null });
      return chain;
    };
    const chatChain = messageChain([
      { session_id: rows[0].id },
      { session_id: rows[0].id },
    ]);
    const legacyChain = messageChain([
      { session_id: rows[1].id },
      { session_id: rows[1].id },
      { session_id: rows[1].id },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'conversation_sessions') return sessionsChain;
      if (table === 'chat_messages') return chatChain;
      return legacyChain;
    });

    const res = await request(app).get('/api/conversation/threads?limit=30').expect(200);

    expect(res.body.threads.map((thread: { message_count: number }) => thread.message_count)).toEqual([2, 3]);
    expect(chatChain.range).toHaveBeenCalledTimes(1);
    expect(legacyChain.range).toHaveBeenCalledTimes(1);
    expect(legacyChain.in).toHaveBeenCalledWith('session_id', [rows[1].id]);
  });

  it('returns only the requested keyset page and derives its cursor from that page', async () => {
    const rowA = {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      title: 'Newest thread',
      updated_at: '2026-08-05T12:00:00.000Z',
      metadata: {},
    };
    const rowB = {
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      title: 'Second thread',
      updated_at: '2026-08-05T11:00:00.000Z',
      metadata: {},
    };
    const sessionsChain: Record<string, unknown> = {};
    sessionsChain.select = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.eq = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.order = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.limit = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.or = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.then = (onFulfilled: (v: unknown) => unknown) => {
      // count query + keyset page query both land here — two rows for a
      // limit=1 request so hasMore is true and rowB is the lookahead.
      return Promise.resolve(onFulfilled({ data: [rowA, rowB], count: 2, error: null }));
    };

    const countChain: Record<string, unknown> = {};
    countChain.select = vi.fn().mockReturnValue(countChain);
    countChain.eq = vi.fn().mockReturnValue(countChain);
    countChain.in = vi.fn().mockReturnValue(countChain);
    countChain.order = vi.fn().mockReturnValue(countChain);
    countChain.range = vi.fn().mockResolvedValue({ data: [], error: null });

    mockFrom.mockImplementation((table: string) =>
      table === 'conversation_sessions' ? sessionsChain : countChain
    );

    const res = await request(app).get('/api/conversation/threads?limit=1').expect(200);

    expect(res.body.hasMore).toBe(true);
    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].id).toBe(rowA.id);
    expect(mockGetLinkedSessionIds).not.toHaveBeenCalled();
    expect(res.body.nextCursor).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(res.body.nextCursor, 'base64url').toString('utf8'));
    expect(decoded).toEqual({ updatedAt: rowA.updated_at, id: rowA.id });
  });

  it('GET /threads/:id/messages handles loader errors gracefully', async () => {
    mockLoadThreadMessages.mockRejectedValue(new Error('DB timeout'));

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: SESSION_ID, title: 'Test', updated_at: '2026-06-01T00:00:00Z', metadata: {} },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(app).get(`/api/conversation/threads/${SESSION_ID}/messages`);

    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('reconciles a create-thread request when first-send session creation wins the race', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: call === 3 ? { id: SESSION_ID, thread_number: null } : null,
        error: null,
      });
      chain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      return chain;
    });

    const res = await request(app)
      .post('/api/conversation/threads')
      .send({ id: SESSION_ID, title: 'Draft' })
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      id: SESSION_ID,
      existing: true,
    });
  });
});
