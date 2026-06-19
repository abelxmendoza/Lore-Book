import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/omegaChatService', () => ({
  omegaChatService: {
    chat: vi.fn(),
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
  optionalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: vi.fn(),
}));

import { chatRouter } from '../../src/routes/chat';
import { omegaChatService } from '../../src/services/omegaChatService';

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

const originalNodeEnv = process.env.NODE_ENV;
const originalApiEnv = process.env.API_ENV;

describe('production guest chat block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
    delete process.env.API_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalApiEnv === undefined) {
      delete process.env.API_ENV;
    } else {
      process.env.API_ENV = originalApiEnv;
    }
  });

  it('blocks anonymous non-stream chat before the AI service', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'hello', conversationHistory: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Guest chat is simulation-only in production');
    expect(omegaChatService.chat).not.toHaveBeenCalled();
    expect(omegaChatService.chatStream).not.toHaveBeenCalled();
  });

  it('blocks anonymous stream chat before the AI service', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hello', conversationHistory: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Guest chat is simulation-only in production');
    expect(omegaChatService.chat).not.toHaveBeenCalled();
    expect(omegaChatService.chatStream).not.toHaveBeenCalled();
  });
});
