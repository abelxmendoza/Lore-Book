import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const assistantUpdates: Array<{ payload: Record<string, unknown> }> = [];

const mentionedEntities = [
  {
    id: 'c1',
    name: 'Tía Maria',
    type: 'character' as const,
    confidence: 1,
    provenance: 'character_book' as const,
  },
  {
    id: 'l1',
    name: 'San Diego',
    type: 'location' as const,
    confidence: 1,
    provenance: 'location_book' as const,
  },
];

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
    (req as { user?: { id: string } }).user = { id: 'user-entities-1' };
    next();
  },
  requireAuth: vi.fn(),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'asst-row-1' }, error: null }),
        }),
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        assistantUpdates.push({ payload });
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })),
  },
}));

import { chatRouter } from '../../src/routes/chat';
import { omegaChatService } from '../../src/services/omegaChatService';

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

async function* mockStream(chunks: string[]) {
  for (const content of chunks) {
    yield { choices: [{ delta: { content } }] };
  }
}

function parseSseEvents(body: string): Array<{ type: string; data?: unknown; content?: string }> {
  return body
    .split('\n\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('POST /api/chat/stream — entity mention metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantUpdates.length = 0;
  });

  it('emits mentionedEntities in the first metadata SSE event when user talks about known entities', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Sounds like a great visit.']),
      content: 'Sounds like a great visit.',
      metadata: {
        sessionId: SESSION_ID,
        messageId: 'user-msg-entities-1',
        characterIds: ['c1'],
        mentionedEntities,
      },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'I visited Tía Maria in San Diego last weekend.',
        threadId: SESSION_ID,
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const metadataEvents = events.filter((e) => e.type === 'metadata');
    expect(metadataEvents.length).toBeGreaterThan(0);

    const firstMeta = metadataEvents[0].data as {
      mentionedEntities?: typeof mentionedEntities;
      characterIds?: string[];
    };
    expect(firstMeta.mentionedEntities).toEqual(mentionedEntities);
    expect(firstMeta.characterIds).toEqual(['c1']);

    const persisted = assistantUpdates.find((u) => u.payload.metadata)?.payload.metadata as {
      mentionedEntities?: typeof mentionedEntities;
      characterIds?: string[];
    };
    expect(persisted?.mentionedEntities).toEqual(mentionedEntities);
    expect(persisted?.characterIds).toEqual(['c1']);
  });

  it('omits mentionedEntities from metadata when nothing was detected', async () => {
    vi.mocked(omegaChatService.chatStream).mockResolvedValue({
      stream: mockStream(['Okay.']),
      content: 'Okay.',
      metadata: {
        sessionId: SESSION_ID,
        messageId: 'user-msg-entities-2',
        characterIds: [],
      },
    } as never);

    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        message: 'Just journaling about my day.',
        threadId: SESSION_ID,
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const firstMeta = events.find((e) => e.type === 'metadata')?.data as {
      mentionedEntities?: unknown;
    };
    expect(firstMeta?.mentionedEntities).toBeUndefined();
  });
});
