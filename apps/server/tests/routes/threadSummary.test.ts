import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user?: { id: string } }).user = { id: 'user-summary-1' };
    next();
  },
}));

const mockSyncFromStoredMessages = vi.fn();
const mockGetContinuity = vi.fn();
const mockGetThreadMeta = vi.fn();
const mockRefresh = vi.fn();

vi.mock('../../src/services/conversationCentered/threadIntelligenceService', () => ({
  threadIntelligenceService: {
    syncFromStoredMessages: (...args: unknown[]) => mockSyncFromStoredMessages(...args),
    getContinuity: (...args: unknown[]) => mockGetContinuity(...args),
    getThreadMeta: (...args: unknown[]) => mockGetThreadMeta(...args),
  },
}));

vi.mock('../../src/services/conversationCentered/threadSummaryService', () => ({
  threadSummaryService: {
    refresh: (...args: unknown[]) => mockRefresh(...args),
  },
}));

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import conversationRouter from '../../src/routes/conversationCentered';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationRouter);

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function mockThreadExists() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: SESSION_ID }, error: null });
  mockFrom.mockReturnValue(chain);
}

describe('Conversation threads API — summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncFromStoredMessages.mockResolvedValue({
      summary_short: 'Trip to San Diego',
      summary_medium: 'You discussed visiting Tía Maria in San Diego.',
      summary_long: 'Full recap of the San Diego visit thread.',
      summary_version: 2,
      message_count: 4,
      people: ['Tía Maria'],
      places: ['San Diego'],
      themes: ['family'],
    });
    mockGetContinuity.mockResolvedValue({
      card: 'People: Tía Maria\nPlaces: San Diego',
      metadata: {},
      openLoopCount: 0,
    });
    mockGetThreadMeta.mockResolvedValue({
      message_count: 4,
      people: ['Tía Maria'],
      places: ['San Diego'],
      themes: ['family'],
    });
    mockRefresh.mockResolvedValue({
      short: 'Updated short',
      medium: 'Updated medium',
      long: 'Updated long',
      version: 3,
      stale: false,
    });
  });

  it('GET /threads/:id/summary returns living summary + recall text', async () => {
    mockThreadExists();

    const res = await request(app)
      .get(`/api/conversation/threads/${SESSION_ID}/summary`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.short).toBe('Trip to San Diego');
    expect(res.body.recallText).toContain('San Diego');
    expect(mockSyncFromStoredMessages).toHaveBeenCalledWith('user-summary-1', SESSION_ID);
  });

  it('POST /threads/:id/summary/refresh forces regeneration', async () => {
    mockThreadExists();

    const res = await request(app)
      .post(`/api/conversation/threads/${SESSION_ID}/summary/refresh`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.short).toBe('Updated short');
    expect(mockRefresh).toHaveBeenCalledWith('user-summary-1', SESSION_ID);
  });
});
