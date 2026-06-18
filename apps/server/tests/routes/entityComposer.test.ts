import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'user-composer-1', email: 'a@b.com' };

const { INDEX, listMentionableEntities, matchMentionableEntitiesInText, sanitizeComposerEntities } = vi.hoisted(() => {
  const INDEX = [
    {
      id: 'uuid-abel',
      name: 'Abel',
      type: 'character' as const,
      aliases: [],
      mentionKeys: ['abel'],
      status: 'confirmed' as const,
    },
    {
      id: 'sug:character:kelly',
      name: 'Kelly',
      type: 'character' as const,
      aliases: [],
      mentionKeys: ['kelly'],
      status: 'suggestion' as const,
    },
  ];

  return {
    INDEX,
    listMentionableEntities: vi.fn().mockResolvedValue(INDEX),
    matchMentionableEntitiesInText: vi.fn((text: string) => {
      if (/abel/i.test(text)) return [INDEX[0]];
      if (/kel/i.test(text)) return [INDEX[1]];
      return [];
    }),
    sanitizeComposerEntities: vi.fn((message: string, submitted: unknown[]) => {
      if (!submitted?.length) return [];
      return submitted.filter((e: { id: string }) => e.id === 'uuid-abel' && /abel/i.test(message));
    }),
  };
});

vi.mock('../../src/middleware/auth', () => ({
  optionalAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../../src/services/entities/entityMentionIndexService', () => ({
  listMentionableEntities,
  matchMentionableEntitiesInText,
  sanitizeComposerEntities,
}));

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

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'asst-1' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })),
  },
}));

import entitiesRouter from '../../src/routes/entities';
import { chatRouter } from '../../src/routes/chat';
import { omegaChatService } from '../../src/services/omegaChatService';

const entitiesApp = express();
entitiesApp.use(express.json());
entitiesApp.use('/api/entities', entitiesRouter);

const chatApp = express();
chatApp.use(express.json());
chatApp.use('/api/chat', chatRouter);

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

async function* mockStream(chunks: string[]) {
  for (const content of chunks) {
    yield { choices: [{ delta: { content } }] };
  }
}

describe('GET /api/entities/certified-index', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mentionable entities for authenticated user', async () => {
    const res = await request(entitiesApp).get('/api/entities/certified-index');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(listMentionableEntities).toHaveBeenCalledWith(mockUser.id);
  });
});

describe('POST /api/entities/match', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches entities in composer text', async () => {
    const res = await request(entitiesApp)
      .post('/api/entities/match')
      .send({ text: 'Tell me about Abel' });

    expect(res.status).toBe(200);
    expect(matchMentionableEntitiesInText).toHaveBeenCalled();
    expect(res.body.matches).toHaveLength(1);
  });

  it('truncates oversized text payloads', async () => {
    const res = await request(entitiesApp)
      .post('/api/entities/match')
      .send({ text: 'x'.repeat(6000) });

    expect(res.status).toBe(200);
    const calledText = vi.mocked(matchMentionableEntitiesInText).mock.calls[0][0] as string;
    expect(calledText.length).toBe(5000);
  });
});

describe('POST /api/chat/stream — composer entity validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Okay.']),
      content: 'Okay.',
      metadata: { sessionId: SESSION_ID, messageId: 'msg-1', characterIds: [] },
    } as never);
  });

  it('passes sanitized composer entities to chatStream', async () => {
    const res = await request(chatApp)
      .post('/api/chat/stream')
      .send({
        message: 'Tell me about Abel',
        threadId: SESSION_ID,
        conversationHistory: [],
        composerEntities: [
          { id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' },
          { id: 'fake-id', name: 'Evil', type: 'character', status: 'confirmed' },
        ],
      });

    expect(res.status).toBe(200);
    expect(omegaChatService.chatStream).toHaveBeenCalled();
    const composerArg = vi.mocked(omegaChatService.chatStream).mock.calls[0][8];
    expect(composerArg).toEqual([
      { id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' },
    ]);
  });
});
