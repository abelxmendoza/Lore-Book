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

vi.mock('../../src/services/conversationCentered/threadContentService', () => ({
  loadThreadMessages: (...args: unknown[]) => mockLoadThreadMessages(...args),
  getLinkedSessionIds: vi.fn().mockResolvedValue([]),
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
