import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockStream = async function* () {
  yield { choices: [{ delta: { content: 'Hello ' } }] };
  yield { choices: [{ delta: { content: 'guest!' } }] };
};

vi.mock('../../src/services/guestChatService', () => ({
  guestChatStream: vi.fn().mockImplementation(async () => ({
    stream: mockStream(),
    loreUpdates: {
      characters: [{ name: 'Alex', role: 'friend' }],
      entries: [{ content: 'Met Alex at the coffee shop.' }],
      locations: [],
      mentionedEntities: [{ id: 'c1', name: 'Alex', type: 'character' }],
    },
  })),
}));

describe('guest routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('POST /stream returns SSE with lore updates metadata', async () => {
    const { guestRouter } = await import('../../src/routes/guest');
    const app = express();
    app.use(express.json());
    app.use('/api/guest', guestRouter);

    const res = await request(app)
      .post('/api/guest/stream')
      .send({
        guestId: 'guest_abc123',
        message: 'My friend Alex works at a coffee shop downtown.',
        conversationHistory: [],
        guestLore: { characters: [], entries: [], locations: [] },
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"type":"metadata"');
    expect(res.text).toContain('"loreUpdates"');
    expect(res.text).toContain('"Alex"');
    expect(res.text).toContain('"type":"chunk"');
    expect(res.text).toContain('"type":"done"');
  });

  it('rejects invalid guest requests', async () => {
    const { guestRouter } = await import('../../src/routes/guest');
    const app = express();
    app.use(express.json());
    app.use('/api/guest', guestRouter);

    const res = await request(app)
      .post('/api/guest/stream')
      .send({ message: 'hi' });

    expect(res.status).toBe(400);
  });
});
