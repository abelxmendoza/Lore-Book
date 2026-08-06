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

  it('nextCursor reflects the true page boundary, not an injected entity-linked orphan', async () => {
    // Regression test for a bug where an old thread pulled in only because a
    // character links back to it (getLinkedSessionIds) could become the LAST
    // item of the merged (page + orphans) array. The cursor was derived from
    // that merged array, so "Load more" would jump to the orphan's ancient
    // timestamp and skip every real thread newer than it — threads vanished
    // from the sidebar on scroll. The cursor must come from the keyset page
    // alone (`threads`), never from the orphan-augmented `merged` list.
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
    const orphan = {
      id: 'cccccccc-0000-4000-8000-000000000003',
      title: 'Ancient orphan thread linked from a character',
      updated_at: '2020-01-01T00:00:00.000Z',
      metadata: {},
    };

    mockGetLinkedSessionIds.mockResolvedValueOnce([orphan.id]);

    const sessionsChain: Record<string, unknown> = {};
    let usedIn = false;
    sessionsChain.select = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.eq = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.order = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.limit = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.or = vi.fn().mockReturnValue(sessionsChain);
    sessionsChain.in = vi.fn().mockImplementation(() => {
      usedIn = true;
      return sessionsChain;
    });
    sessionsChain.then = (onFulfilled: (v: unknown) => unknown) => {
      if (usedIn) {
        usedIn = false;
        return Promise.resolve(onFulfilled({ data: [orphan], count: 1, error: null }));
      }
      // count query + keyset page query both land here — two rows for a
      // limit=1 request so hasMore is true and rowB is the lookahead.
      return Promise.resolve(onFulfilled({ data: [rowA, rowB], count: 2, error: null }));
    };

    const countChain: Record<string, unknown> = {};
    countChain.select = vi.fn().mockReturnValue(countChain);
    countChain.eq = vi.fn().mockReturnValue(countChain);
    countChain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(onFulfilled({ count: 0, error: null }));

    mockFrom.mockImplementation((table: string) =>
      table === 'conversation_sessions' ? sessionsChain : countChain
    );

    const res = await request(app).get('/api/conversation/threads?limit=1').expect(200);

    expect(res.body.hasMore).toBe(true);
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
});
