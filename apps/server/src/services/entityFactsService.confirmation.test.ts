import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../config', () => ({ config: {} }));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../lib/openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

import { supabaseAdmin } from './supabaseClient';
import { openai } from '../lib/openai';
import { entityFactsService } from './entityFactsService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockCreate = openai.chat.completions.create as ReturnType<typeof vi.fn>;

function mockExtractedSelfFacts(facts: Array<{ fact: string; category: string; confidence: number }>) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ facts }) } }],
  });
}

describe('entityFactsService confirmation evidence dedupe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bumps confirmation once per distinct sourceMessageId', async () => {
    const existing = {
      id: 'fact-1',
      fact: 'Works at Vanguard Robotics',
      category: 'career',
      confidence: 0.8,
      mention_count: 1,
      status: 'active',
      previous_value: null,
      first_seen_at: '2024-01-01T00:00:00.000Z',
      last_confirmed_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      metadata: { evidence_ids: ['msg-1'], confirmation_count: 1 },
    };

    const updates: Array<Record<string, unknown>> = [];
    mockExtractedSelfFacts([
      { fact: 'Works at Vanguard Robotics', category: 'career', confidence: 0.85 },
    ]);

    mockFrom.mockImplementation(() => {
      const obj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push(patch);
          return obj;
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: existing, error: null }),
        then: (resolve: any) => resolve({ data: [existing], error: null }),
      };
      return obj;
    });

    // Same message id → no bump
    await entityFactsService.extractAndPersistSelfFacts('user-1', 'char-1', 'I work at Vanguard Robotics', {
      sourceMessageId: 'msg-1',
    });
    const sameMsg = updates.at(-1);
    expect((sameMsg?.metadata as any)?.confirmation_count).toBe(1);
    expect((sameMsg?.metadata as any)?.evidence_ids).toEqual(['msg-1']);

    updates.length = 0;
    // New message id → bump
    await entityFactsService.extractAndPersistSelfFacts('user-1', 'char-1', 'I work at Vanguard Robotics', {
      sourceMessageId: 'msg-2',
    });
    const newMsg = updates.at(-1);
    expect((newMsg?.metadata as any)?.confirmation_count).toBe(2);
    expect((newMsg?.metadata as any)?.evidence_ids).toEqual(['msg-1', 'msg-2']);
    expect(newMsg?.mention_count).toBe(2);
  });
});
