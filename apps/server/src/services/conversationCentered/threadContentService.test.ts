import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

describe('threadContentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadThreadMessages falls back to chat_messages when metadata and conversation_messages are empty', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions' ? { metadata: {} } : null,
      });
      if (table === 'conversation_messages') {
        builder.then = undefined;
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-1',
                    role: 'user',
                    content: 'I met Ashley De la Cruz today',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Ashley');
  });

  it('merges chat_messages when metadata contains only a partial user-only snapshot', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions'
          ? {
              metadata: {
                messages: [
                  {
                    id: 'user-local-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    timestamp: '2026-06-01T00:00:00Z',
                  },
                ],
              },
            }
          : null,
      });
      if (table === 'conversation_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      if (table === 'chat_messages') {
        Object.assign(builder, {
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve(
              onFulfilled({
                data: [
                  {
                    id: 'cm-user-1',
                    role: 'user',
                    content: 'Who is Jerry?',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                  {
                    id: 'cm-assistant-1',
                    role: 'assistant',
                    content: 'Jerry is tied to early LoreBook development.',
                    created_at: '2026-06-01T00:00:01Z',
                    metadata: null,
                  },
                ],
              })
            );
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toContain('Jerry');
  });
});
