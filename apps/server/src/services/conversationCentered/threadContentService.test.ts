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
                    content: 'I met Alex Morgan today',
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
    expect(messages[0].content).toContain('Alex');
  });

  it('prefers chat_messages over legacy metadata snapshot when both exist', async () => {
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
                    content: 'Jerry is tied to early LifeLedger development.',
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
    expect(messages[1].id).toBe('cm-assistant-1');
  });

  it('merges assistant from metadata when chat_messages is user-only', async () => {
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
                    id: 'meta-a1',
                    role: 'assistant',
                    content: 'Jerry worked on LifeLedger early on.',
                    timestamp: '2026-06-01T00:00:01Z',
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
    expect(messages[1].content).toContain('LifeLedger');
  });

  it('filters empty assistant placeholders from merged results', async () => {
    const chain = (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.eq = vi.fn().mockReturnValue(builder);
      builder.order = vi.fn().mockReturnValue(builder);
      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: table === 'conversation_sessions' ? { metadata: {} } : null,
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
                    content: 'hello',
                    created_at: '2026-06-01T00:00:00Z',
                    metadata: null,
                  },
                  {
                    id: 'cm-empty-asst',
                    role: 'assistant',
                    content: '   ',
                    created_at: '2026-06-01T00:00:01Z',
                    metadata: { stream_status: 'streaming' },
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
    expect(messages[0].role).toBe('user');
  });

  it('falls back to legacy metadata when chat_messages is empty', async () => {
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
            return Promise.resolve(onFulfilled({ data: [] }));
          },
        });
      }
      return builder;
    };

    mockFrom.mockImplementation(chain);

    const { loadThreadMessages } = await import('./threadContentService');
    const messages = await loadThreadMessages('user-1', 'session-1');

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Jerry');
  });
});
