import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockWaitFor = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/lorebook/parser/loreBookNoticeBus', () => ({
  loreBookNoticeBus: { waitFor: mockWaitFor },
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
}));

import { requireAuth } from '../../src/middleware/auth';
import { chatRouter } from '../../src/routes/chat';

describe('GET /api/chat/lorebook-notice/:messageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as express.Request & { user?: { id: string } }).user = { id: 'user-1' };
      next();
    });
  });

  it('returns 204 on timeout', async () => {
    mockWaitFor.mockResolvedValue(null);
    const app = express();
    app.use('/api/chat', chatRouter);

    const res = await request(app).get('/api/chat/lorebook-notice/msg-1');
    expect(res.status).toBe(204);
    expect(mockWaitFor).toHaveBeenCalledWith('msg-1', 8000);
  });

  it('returns notice JSON for owner', async () => {
    const notice = {
      chatMessageId: 'msg-1',
      userId: 'user-1',
      timestamp: new Date().toISOString(),
      items: [{ domain: 'quests', name: 'Ship beta', confidence: 0.9 }],
    };
    mockWaitFor.mockResolvedValue(notice);

    const app = express();
    app.use('/api/chat', chatRouter);

    const res = await request(app).get('/api/chat/lorebook-notice/msg-1');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('returns 403 when userId mismatches', async () => {
    mockWaitFor.mockResolvedValue({
      chatMessageId: 'msg-1',
      userId: 'other-user',
      timestamp: new Date().toISOString(),
      items: [],
    });

    const app = express();
    app.use('/api/chat', chatRouter);

    const res = await request(app).get('/api/chat/lorebook-notice/msg-1');
    expect(res.status).toBe(403);
  });
});
