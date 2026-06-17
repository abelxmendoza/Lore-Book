import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration-style tests for threadRecoveryService backfill behavior.
 * Uses the real loadThreadMessages merge with mocked Supabase rows.
 */

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function supabaseChain(table: string, handlers: Record<string, () => unknown>) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.maybeSingle = vi.fn().mockImplementation(async () => {
    if (table === 'conversation_sessions') {
      return {
        data: {
          metadata: {
            messages: [
              { role: 'user', content: 'Who is Alex?', timestamp: '2026-06-01T00:00:00Z' },
              { role: 'assistant', content: 'Alex is a college friend.', timestamp: '2026-06-01T00:00:01Z' },
            ],
          },
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data: { id: 'new-asst' }, error: null });
  Object.assign(builder, {
    then(onFulfilled: (v: unknown) => unknown) {
      const resolver = handlers[table];
      return Promise.resolve(onFulfilled(resolver ? resolver() : { data: [], error: null }));
    },
  });
  return builder;
}

describe('threadRecoveryService integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('loadThreadMessages surfaces assistant from metadata when chat is user-only (backfill prerequisite)', async () => {
    mockFrom.mockImplementation((table: string) =>
      supabaseChain(table, {
        chat_messages: () => ({
          data: [{ role: 'user', content: 'Who is Alex?', created_at: '2026-06-01T00:00:00Z', id: 'u1' }],
        }),
        conversation_messages: () => ({ data: [] }),
      })
    );

    const { loadThreadMessages } = await import('../../src/services/conversationCentered/threadContentService');
    const merged = await loadThreadMessages('user-1', 'session-1');

    expect(merged.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(merged[1].content).toContain('college friend');
  });
});
